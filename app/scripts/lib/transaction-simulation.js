import { hexToBytes } from '@ethereumjs/util';
import { decode } from '@metamask/abi-utils';

import { callContract } from './contract-call';

/**
 * Previews a pending transaction's balance changes with the standard
 * `eth_simulateV1` method (ethereum/execution-apis), sent to the wallet's own
 * RPC endpoint. No third-party simulation service is involved.
 *
 * The result is shown on the confirmation as an estimate only. Nothing in it
 * feeds into what is signed.
 */

export const SIMULATION_TIMEOUT_MS = 5000;
// Token names and decimals are a nicety; past this the UI shows raw units.
export const TOKEN_METADATA_TIMEOUT_MS = 3000;
// Bounds the eth_call requests one simulation can make for token details.
const MAX_TOKEN_METADATA_LOOKUPS = 10;
const MAX_REVERT_REASON_LENGTH = 200;
const MAX_SYMBOL_LENGTH = 12;

export const SIMULATION_STATUS = {
  LOADING: 'loading',
  SUCCESS: 'success',
  REVERTED: 'reverted',
  UNAVAILABLE: 'unavailable',
};

// The address traceTransfers gives the logs it adds for native transfers.
export const NATIVE_TRANSFER_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// keccak256 of the event signatures
export const EVENT_TOPICS = {
  // Transfer(address,address,uint256): ERC-20 (value in data) and ERC-721
  // (token id indexed).
  TRANSFER:
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  // Approval(address,address,uint256): ERC-20 and ERC-721, as above.
  APPROVAL:
    '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
  // ApprovalForAll(address,address,bool): ERC-721 and ERC-1155.
  APPROVAL_FOR_ALL:
    '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31',
  // TransferSingle(address,address,address,uint256,uint256)
  TRANSFER_SINGLE:
    '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
  // TransferBatch(address,address,address,uint256[],uint256[])
  TRANSFER_BATCH:
    '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ERROR_SELECTOR = '0x08c379a0'; // Error(string)
const PANIC_SELECTOR = '0x4e487b71'; // Panic(uint256)

// Errors that mean the transaction itself would fail, rather than that the
// node cannot simulate: execution reverted (3), VM execution error (-32015)
// and insufficient funds (-38014).
const TRANSACTION_FAILURE_CODES = new Set([3, -32015, -38014]);

/**
 * The transaction fields the simulation depends on. Fee edits do not change
 * the result (fees are left out of the simulated call), so only these trigger
 * a new simulation.
 */
const SIMULATION_INPUTS = [
  'from',
  'to',
  'value',
  'data',
  'gas',
  'accessList',
  'authorizationList',
];

/**
 * Whether an edit changed what the simulation depends on.
 *
 * @param {object} [before] - The simulated transaction params.
 * @param {object} [after] - The current transaction params.
 * @returns {boolean} True if the simulation should be run again.
 */
export function simulationInputsChanged(before = {}, after = {}) {
  return SIMULATION_INPUTS.some(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

/**
 * Builds the eth_simulateV1 params for one transaction at the latest block.
 * Fees and the nonce are left out and validation is off, so the call is
 * simulated as is without base-fee, nonce or fee-balance checks, and the
 * balance changes do not include the network fee.
 *
 * @param {object} txParams - The transaction params.
 * @returns {Array} The params for eth_simulateV1.
 */
export function buildSimulationParams(txParams) {
  const call = { from: txParams.from };
  if (txParams.to) {
    call.to = txParams.to;
  }
  call.value = txParams.value || '0x0';
  if (txParams.data) {
    // The spec's field is `input`; some clients only read `data`. Clients
    // accept both when they agree.
    call.input = txParams.data;
    call.data = txParams.data;
  }
  if (txParams.gas) {
    call.gas = txParams.gas;
  }
  if (txParams.accessList) {
    call.accessList = txParams.accessList;
  }
  if (txParams.authorizationList) {
    call.authorizationList = txParams.authorizationList;
  }
  return [
    {
      blockStateCalls: [{ calls: [call] }],
      traceTransfers: true,
      validation: false,
    },
    'latest',
  ];
}

/**
 * Rejects if the promise does not settle in time.
 *
 * @param {Promise} promise - The promise to wait for.
 * @param {number} ms - The time limit.
 * @returns {Promise} The promise's result.
 */
export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Timed out after ${ms}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Whether a character could hide or disguise text: control characters,
 * zero-width characters and bidirectional overrides.
 *
 * @param {number} code - The character's code point.
 * @returns {boolean} True if the character should be removed.
 */
function isDisguisingCharacter(code) {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function cleanText(text, maxLength) {
  const cleaned = Array.from(String(text))
    .filter((character) => !isDisguisingCharacter(character.codePointAt(0)))
    .join('')
    .trim();
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1)}…`
    : cleaned;
}

/**
 * Decodes a Solidity revert payload.
 *
 * @param {string} [data] - The revert data, as hex.
 * @returns {string|undefined} The reason, or undefined if it cannot be read.
 */
export function decodeRevertReason(data) {
  if (typeof data !== 'string' || !data.startsWith('0x')) {
    return undefined;
  }
  const selector = data.slice(0, 10).toLowerCase();
  try {
    if (selector === ERROR_SELECTOR) {
      const [reason] = decode(['string'], hexToBytes(`0x${data.slice(10)}`));
      return reason ? cleanText(reason, MAX_REVERT_REASON_LENGTH) : undefined;
    }
    if (selector === PANIC_SELECTOR) {
      const [code] = decode(['uint256'], hexToBytes(`0x${data.slice(10)}`));
      return `Panic(0x${code.toString(16)})`;
    }
  } catch (_) {
    return undefined;
  }
  return undefined;
}

function topicToAddress(topic) {
  return typeof topic === 'string' && topic.length === 66
    ? `0x${topic.slice(26)}`.toLowerCase()
    : undefined;
}

function toBigInt(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-f]*$/iu.test(hex)) {
    return undefined;
  }
  return hex === '0x' ? undefined : BigInt(hex);
}

function dataWords(data) {
  if (typeof data !== 'string' || !data.startsWith('0x')) {
    return [];
  }
  return data.slice(2).match(/.{64}/gu) || [];
}

function decodeBatch(data) {
  try {
    const [ids, values] = decode(['uint256[]', 'uint256[]'], hexToBytes(data));
    return ids.length === values.length
      ? ids.map((id, index) => [id, values[index]])
      : [];
  } catch (_) {
    return [];
  }
}

/**
 * Derives the user's balance changes and the approvals the user grants from
 * an eth_simulateV1 result.
 *
 * @param {Array} result - The eth_simulateV1 result: one entry per block,
 * each with the results of its calls.
 * @param {string} userAddress - The sending account.
 * @returns {object} The simulation: its status, and for a successful one the
 * `changes` (signed decimal amounts in base units) and `approvals`; for a
 * reverted one the `revertReason`.
 */
export function parseSimulationResult(result, userAddress) {
  const calls = Array.isArray(result)
    ? result.flatMap((block) => block?.calls || [])
    : [];
  if (!calls.length) {
    return { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'error' };
  }
  const failed = calls.find(
    (call) => call.error || (call.status !== undefined && !Number(call.status)),
  );
  if (failed) {
    return {
      status: SIMULATION_STATUS.REVERTED,
      revertReason:
        decodeRevertReason(failed.returnData) ||
        decodeRevertReason(failed.error?.data) ||
        (failed.error?.message
          ? cleanText(failed.error.message, MAX_REVERT_REASON_LENGTH)
          : undefined),
    };
  }

  const user = userAddress.toLowerCase();
  const balances = new Map();
  const approvals = new Map();
  const add = (key, entry, amount) => {
    const existing = balances.get(key) || { ...entry, amount: 0n };
    existing.amount += amount;
    balances.set(key, existing);
  };
  const move = (from, to, key, entry, amount) => {
    if (from === user) {
      add(key, entry, -amount);
    }
    if (to === user) {
      add(key, entry, amount);
    }
  };

  for (const { address: rawAddress, topics = [], data } of calls.flatMap(
    (call) => call.logs || [],
  )) {
    const address = String(rawAddress).toLowerCase();
    const [topic0] = topics;
    if (topic0 === EVENT_TOPICS.TRANSFER && topics.length === 3) {
      const amount = toBigInt(data);
      if (amount === undefined) {
        continue;
      }
      const [from, to] = [topicToAddress(topics[1]), topicToAddress(topics[2])];
      if (address === NATIVE_TRANSFER_ADDRESS) {
        move(from, to, 'native', { standard: 'native' }, amount);
      } else {
        move(from, to, address, { standard: 'erc20', address }, amount);
      }
    } else if (topic0 === EVENT_TOPICS.TRANSFER && topics.length === 4) {
      const tokenId = BigInt(topics[3]).toString(10);
      move(
        topicToAddress(topics[1]),
        topicToAddress(topics[2]),
        `${address}:721:${tokenId}`,
        { standard: 'erc721', address, tokenId },
        1n,
      );
    } else if (topic0 === EVENT_TOPICS.TRANSFER_SINGLE && topics.length === 4) {
      const [id, value] = dataWords(data);
      if (value === undefined) {
        continue;
      }
      const tokenId = BigInt(`0x${id}`).toString(10);
      move(
        topicToAddress(topics[2]),
        topicToAddress(topics[3]),
        `${address}:1155:${tokenId}`,
        { standard: 'erc1155', address, tokenId },
        BigInt(`0x${value}`),
      );
    } else if (topic0 === EVENT_TOPICS.TRANSFER_BATCH && topics.length === 4) {
      for (const [id, value] of decodeBatch(data)) {
        const tokenId = id.toString(10);
        move(
          topicToAddress(topics[2]),
          topicToAddress(topics[3]),
          `${address}:1155:${tokenId}`,
          { standard: 'erc1155', address, tokenId },
          value,
        );
      }
    } else if (
      topic0 === EVENT_TOPICS.APPROVAL &&
      topicToAddress(topics[1]) === user
    ) {
      const spender = topicToAddress(topics[2]);
      // ERC-721 transfers clear the token's approval with the zero address.
      if (!spender || spender === ZERO_ADDRESS) {
        continue;
      }
      if (topics.length === 3) {
        const amount = toBigInt(data);
        if (amount !== undefined) {
          // A later approval replaces an earlier one for the same spender.
          approvals.set(`${address}:20:${spender}`, {
            standard: 'erc20',
            address,
            spender,
            amount: amount.toString(10),
          });
        }
      } else if (topics.length === 4) {
        const tokenId = BigInt(topics[3]).toString(10);
        approvals.set(`${address}:721:${tokenId}`, {
          standard: 'erc721',
          address,
          spender,
          tokenId,
        });
      }
    } else if (
      topic0 === EVENT_TOPICS.APPROVAL_FOR_ALL &&
      topics.length === 3 &&
      topicToAddress(topics[1]) === user
    ) {
      const spender = topicToAddress(topics[2]);
      approvals.set(`${address}:all:${spender}`, {
        standard: 'approvalForAll',
        address,
        spender,
        approved: toBigInt(data) > 0n,
      });
    }
  }

  return {
    status: SIMULATION_STATUS.SUCCESS,
    changes: [...balances.values()]
      .filter(({ amount }) => amount !== 0n)
      .map((change) => ({ ...change, amount: change.amount.toString(10) })),
    approvals: [...approvals.values()],
  };
}

/**
 * Classifies an error from the eth_simulateV1 request.
 *
 * @param {Error|object} error - The error.
 * @returns {object} A reverted simulation if the error says the transaction
 * would fail, otherwise an unavailable one.
 */
export function simulationFromError(error) {
  if (error?.name === 'TimeoutError') {
    return { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'timeout' };
  }
  const code = Number(error?.code);
  const message = String(error?.message || '');
  if (TRANSACTION_FAILURE_CODES.has(code)) {
    return {
      status: SIMULATION_STATUS.REVERTED,
      revertReason:
        decodeRevertReason(error.data) ||
        decodeRevertReason(error.data?.data) ||
        cleanText(message, MAX_REVERT_REASON_LENGTH) ||
        undefined,
    };
  }
  if (
    code === -32601 ||
    /method|not (found|supported|available)/iu.test(message)
  ) {
    return { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'unsupported' };
  }
  return { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'error' };
}

async function readSymbol(query, address) {
  try {
    const [symbol] = await callContract(query, address, 'symbol()', ['string']);
    return symbol;
  } catch (_) {
    // Some older tokens return bytes32.
    const [raw] = await callContract(query, address, 'symbol()', ['bytes32']);
    return Buffer.from(raw.slice(2), 'hex')
      .toString('utf8')
      .replace(/\0+$/u, '');
  }
}

async function readTokenMetadata(query, address, needsDecimals) {
  const [symbol, decimals] = await Promise.all([
    readSymbol(query, address).catch(() => undefined),
    needsDecimals
      ? callContract(query, address, 'decimals()', ['uint8'])
          .then(([value]) => Number(value))
          .catch(() => undefined)
      : undefined,
  ]);
  const metadata = {};
  const cleanSymbol = symbol && cleanText(symbol, MAX_SYMBOL_LENGTH);
  if (cleanSymbol) {
    metadata.symbol = cleanSymbol;
  }
  if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 77) {
    metadata.decimals = decimals;
  }
  return metadata;
}

/**
 * Reads the symbol, and for fungible tokens the decimals, of the tokens in a
 * simulation. Failures leave a token's details out, so it shows in raw units.
 *
 * @param {object} query - A promise-returning EthQuery on the wallet's provider.
 * @param {object} simulation - A successful simulation.
 * @param {number} [timeoutMs] - The time limit for all the lookups.
 * @returns {Promise<object>} Details by lowercase token address.
 */
export async function getSimulationTokenMetadata(
  query,
  simulation,
  timeoutMs = TOKEN_METADATA_TIMEOUT_MS,
) {
  const tokens = new Map();
  for (const { standard, address } of [
    ...simulation.changes,
    ...simulation.approvals,
  ]) {
    if (address) {
      tokens.set(address, tokens.get(address) || standard === 'erc20');
    }
  }
  const lookups = [...tokens.entries()].slice(0, MAX_TOKEN_METADATA_LOOKUPS);
  const results = await Promise.all(
    lookups.map(([address, needsDecimals]) =>
      withTimeout(readTokenMetadata(query, address, needsDecimals), timeoutMs)
        .then((metadata) => [address, metadata])
        .catch(() => [address, {}]),
    ),
  );
  return Object.fromEntries(
    results.filter(([, metadata]) => Object.keys(metadata).length),
  );
}

/**
 * Simulates a transaction and describes its effect on the sender. Never
 * rejects: a node without eth_simulateV1, a timeout or any other error gives
 * an unavailable simulation.
 *
 * @param {object} options - Options.
 * @param {object} options.txParams - The transaction params.
 * @param {Function} options.request - Sends a JSON-RPC request to the wallet's
 * provider: `(method, params) => Promise<result>`, rejecting with the RPC
 * error (including its code).
 * @param {object} [options.query] - A promise-returning EthQuery on the same
 * provider, for token details.
 * @param {number} [options.timeoutMs] - The time limit for the simulation.
 * @returns {Promise<object>} The simulation, to attach to the txMeta.
 */
export async function simulateTransaction({
  txParams,
  request,
  query,
  timeoutMs = SIMULATION_TIMEOUT_MS,
}) {
  let simulation;
  try {
    const result = await withTimeout(
      request('eth_simulateV1', buildSimulationParams(txParams)),
      timeoutMs,
    );
    simulation = parseSimulationResult(result, txParams.from);
  } catch (error) {
    simulation = simulationFromError(error);
  }
  if (simulation.status === SIMULATION_STATUS.SUCCESS && query) {
    try {
      simulation.tokens = await getSimulationTokenMetadata(query, simulation);
    } catch (_) {
      simulation.tokens = {};
    }
  }
  return { ...simulation, simulatedAt: Date.now() };
}

/**
 * Sends a JSON-RPC request to a provider, keeping the RPC error's code.
 *
 * @param {object} provider - A provider with `sendAsync`.
 * @returns {Function} `(method, params) => Promise<result>`
 */
export function createProviderRequest(provider) {
  let nextId = 1;
  return (method, params) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      provider.sendAsync(
        {
          id: `simulation-${Date.now()}-${nextId}`,
          jsonrpc: '2.0',
          method,
          params,
        },
        (error, response) => {
          const rpcError = response?.error || error;
          if (rpcError) {
            const wrapped = new Error(rpcError.message || String(rpcError));
            wrapped.code = rpcError.code;
            wrapped.data = rpcError.data;
            reject(wrapped);
          } else {
            resolve(response.result);
          }
        },
      );
    });
}
