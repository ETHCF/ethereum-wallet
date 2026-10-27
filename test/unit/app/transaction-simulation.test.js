import { bytesToHex } from '@ethereumjs/util';
import { encode } from '@metamask/abi-utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3.js';
import assert from 'assert';

import { encodeCall } from '../../../app/scripts/lib/contract-call';
import {
  EVENT_TOPICS,
  NATIVE_TRANSFER_ADDRESS,
  SIMULATION_STATUS,
  SYSTEM_TRANSFER_ADDRESS,
  buildSimulationParams,
  decodeRevertReason,
  parseSimulationResult,
  simulateTransaction,
  simulationFromError,
  simulationInputsChanged,
} from '../../../app/scripts/lib/transaction-simulation';

const USER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const NFT = '0x4444444444444444444444444444444444444444';
const MULTI = '0x5555555555555555555555555555555555555555';
const ZERO = '0x0000000000000000000000000000000000000000';

const topic = (address) => `0x${address.slice(2).padStart(64, '0')}`;
const word = (value) => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
const success = (logs) => [{ calls: [{ status: '0x1', logs }] }];
const errorData = (reason) =>
  `0x08c379a0${bytesToHex(encode(['string'], [reason])).slice(2)}`;

function transfer(address, from, to, amount) {
  return {
    address,
    topics: [EVENT_TOPICS.TRANSFER, topic(from), topic(to)],
    data: word(amount),
  };
}

describe('transaction simulation', function () {
  it('uses the keccak256 hashes of the event signatures', function () {
    const hash = (signature) =>
      bytesToHex(keccak256(Buffer.from(signature, 'utf8')));
    assert.deepEqual(EVENT_TOPICS, {
      TRANSFER: hash('Transfer(address,address,uint256)'),
      APPROVAL: hash('Approval(address,address,uint256)'),
      APPROVAL_FOR_ALL: hash('ApprovalForAll(address,address,bool)'),
      TRANSFER_SINGLE: hash(
        'TransferSingle(address,address,address,uint256,uint256)',
      ),
      TRANSFER_BATCH: hash(
        'TransferBatch(address,address,address,uint256[],uint256[])',
      ),
    });
  });

  describe('buildSimulationParams', function () {
    it('simulates the call at the latest block with transfer tracing and without fees', function () {
      const params = buildSimulationParams({
        from: USER,
        to: TOKEN,
        value: '0x1',
        data: '0xabcd',
        gas: '0x5208',
        maxFeePerGas: '0x10',
        maxPriorityFeePerGas: '0x1',
        nonce: '0x7',
      });
      assert.deepEqual(params, [
        {
          blockStateCalls: [
            {
              calls: [
                {
                  from: USER,
                  to: TOKEN,
                  value: '0x1',
                  input: '0xabcd',
                  data: '0xabcd',
                  gas: '0x5208',
                },
              ],
            },
          ],
          traceTransfers: true,
          validation: false,
        },
        'latest',
      ]);
    });
  });

  describe('simulationInputsChanged', function () {
    const params = {
      from: USER,
      to: TOKEN,
      value: '0x0',
      data: '0x',
      gas: '0x1',
    };

    it('ignores fee edits', function () {
      assert.equal(
        simulationInputsChanged(params, {
          ...params,
          maxFeePerGas: '0x2',
          gasPrice: '0x3',
        }),
        false,
      );
    });

    it('detects edits to the call', function () {
      for (const key of ['to', 'value', 'data', 'gas']) {
        assert.equal(
          simulationInputsChanged(params, { ...params, [key]: '0x99' }),
          true,
          key,
        );
      }
    });
  });

  describe('parseSimulationResult', function () {
    it('derives the native balance change from traceTransfers logs', function () {
      const simulation = parseSimulationResult(
        success([
          transfer(NATIVE_TRANSFER_ADDRESS, USER, OTHER, 10n ** 18n),
          transfer(NATIVE_TRANSFER_ADDRESS, OTHER, USER, 25n * 10n ** 16n),
        ]),
        USER,
      );
      assert.equal(simulation.status, SIMULATION_STATUS.SUCCESS);
      assert.deepEqual(simulation.changes, [
        { standard: 'native', amount: '-750000000000000000' },
      ]);
    });

    it("derives the native balance change from EIP-7708's system logs", function () {
      const simulation = parseSimulationResult(
        success([
          transfer(SYSTEM_TRANSFER_ADDRESS, USER, OTHER, 3n * 10n ** 17n),
        ]),
        USER,
      );
      assert.deepEqual(simulation.changes, [
        { standard: 'native', amount: '-300000000000000000' },
      ]);
    });

    it('counts a native transfer once when a node returns both kinds of log', function () {
      const simulation = parseSimulationResult(
        success([
          transfer(NATIVE_TRANSFER_ADDRESS, USER, OTHER, 3n * 10n ** 17n),
          transfer(SYSTEM_TRANSFER_ADDRESS, USER, OTHER, 3n * 10n ** 17n),
          transfer(TOKEN, USER, OTHER, 5n),
        ]),
        USER,
      );
      assert.deepEqual(simulation.changes, [
        { standard: 'native', amount: '-300000000000000000' },
        { standard: 'erc20', address: TOKEN, amount: '-5' },
      ]);
    });

    it('chooses the kind of native log for each call separately', function () {
      const simulation = parseSimulationResult(
        [
          {
            calls: [
              {
                status: '0x1',
                logs: [transfer(NATIVE_TRANSFER_ADDRESS, USER, OTHER, 2n)],
              },
              {
                status: '0x1',
                logs: [
                  transfer(NATIVE_TRANSFER_ADDRESS, USER, OTHER, 3n),
                  transfer(SYSTEM_TRANSFER_ADDRESS, USER, OTHER, 3n),
                ],
              },
            ],
          },
        ],
        USER,
      );
      assert.deepEqual(simulation.changes, [
        { standard: 'native', amount: '-5' },
      ]);
    });

    it('nets ERC-20 transfers per token and ignores other accounts', function () {
      const simulation = parseSimulationResult(
        success([
          transfer(TOKEN, USER, OTHER, 100),
          transfer(TOKEN, OTHER, USER, 30),
          transfer(TOKEN, OTHER, ZERO, 5000),
          // a net-zero token is left out
          transfer(MULTI, USER, OTHER, 7),
          transfer(MULTI, OTHER, USER, 7),
        ]),
        USER,
      );
      assert.deepEqual(simulation.changes, [
        { standard: 'erc20', address: TOKEN, amount: '-70' },
      ]);
    });

    it('keeps amounts beyond Number precision exact', function () {
      const amount = 2n ** 255n + 1n;
      const simulation = parseSimulationResult(
        success([transfer(TOKEN, OTHER, USER, amount)]),
        USER,
      );
      assert.equal(simulation.changes[0].amount, amount.toString());
    });

    it('derives ERC-721 transfers from the indexed token id', function () {
      const simulation = parseSimulationResult(
        success([
          {
            address: NFT,
            topics: [
              EVENT_TOPICS.TRANSFER,
              topic(OTHER),
              topic(USER),
              word(42),
            ],
            data: '0x',
          },
          {
            address: NFT,
            topics: [EVENT_TOPICS.TRANSFER, topic(USER), topic(OTHER), word(7)],
            data: '0x',
          },
        ]),
        USER,
      );
      assert.deepEqual(simulation.changes, [
        { standard: 'erc721', address: NFT, tokenId: '42', amount: '1' },
        { standard: 'erc721', address: NFT, tokenId: '7', amount: '-1' },
      ]);
    });

    it('derives ERC-1155 single and batch transfers', function () {
      const simulation = parseSimulationResult(
        success([
          {
            address: MULTI,
            topics: [
              EVENT_TOPICS.TRANSFER_SINGLE,
              topic(OTHER),
              topic(OTHER),
              topic(USER),
            ],
            data: `${word(1)}${word(5).slice(2)}`,
          },
          {
            address: MULTI,
            topics: [
              EVENT_TOPICS.TRANSFER_BATCH,
              topic(OTHER),
              topic(USER),
              topic(OTHER),
            ],
            data: bytesToHex(
              encode(
                ['uint256[]', 'uint256[]'],
                [
                  [1n, 2n],
                  [2n, 3n],
                ],
              ),
            ),
          },
        ]),
        USER,
      );
      assert.deepEqual(simulation.changes, [
        { standard: 'erc1155', address: MULTI, tokenId: '1', amount: '3' },
        { standard: 'erc1155', address: MULTI, tokenId: '2', amount: '-3' },
      ]);
    });

    it('reports approvals the user grants', function () {
      const simulation = parseSimulationResult(
        success([
          {
            address: TOKEN,
            topics: [EVENT_TOPICS.APPROVAL, topic(USER), topic(OTHER)],
            data: word(5),
          },
          // a later approval for the same spender replaces the earlier one
          {
            address: TOKEN,
            topics: [EVENT_TOPICS.APPROVAL, topic(USER), topic(OTHER)],
            data: word(2n ** 256n - 1n),
          },
          {
            address: NFT,
            topics: [EVENT_TOPICS.APPROVAL, topic(USER), topic(OTHER), word(9)],
            data: '0x',
          },
          // an ERC-721 transfer clearing the approval is not one
          {
            address: NFT,
            topics: [EVENT_TOPICS.APPROVAL, topic(USER), topic(ZERO), word(8)],
            data: '0x',
          },
          {
            address: MULTI,
            topics: [EVENT_TOPICS.APPROVAL_FOR_ALL, topic(USER), topic(OTHER)],
            data: word(1),
          },
          {
            address: NFT,
            topics: [EVENT_TOPICS.APPROVAL_FOR_ALL, topic(USER), topic(OTHER)],
            data: word(0),
          },
          // someone else's approval
          {
            address: TOKEN,
            topics: [EVENT_TOPICS.APPROVAL, topic(OTHER), topic(USER)],
            data: word(1),
          },
        ]),
        USER,
      );
      assert.deepEqual(simulation.changes, []);
      assert.deepEqual(simulation.approvals, [
        {
          standard: 'erc20',
          address: TOKEN,
          spender: OTHER,
          amount: (2n ** 256n - 1n).toString(),
        },
        { standard: 'erc721', address: NFT, spender: OTHER, tokenId: '9' },
        {
          standard: 'approvalForAll',
          address: MULTI,
          spender: OTHER,
          approved: true,
        },
        {
          standard: 'approvalForAll',
          address: NFT,
          spender: OTHER,
          approved: false,
        },
      ]);
    });

    it('reports a revert with its decoded reason', function () {
      const simulation = parseSimulationResult(
        [
          {
            calls: [
              {
                status: '0x0',
                returnData: errorData('ERC20: insufficient allowance'),
                logs: [],
                error: { code: 3, message: 'execution reverted' },
              },
            ],
          },
        ],
        USER,
      );
      assert.deepEqual(simulation, {
        status: SIMULATION_STATUS.REVERTED,
        revertReason: 'ERC20: insufficient allowance',
      });
    });

    it("falls back to the node's message for a revert without a reason", function () {
      const simulation = parseSimulationResult(
        [
          {
            calls: [
              {
                status: '0x0',
                returnData: '0x',
                logs: [],
                error: { code: -32015, message: 'out of gas' },
              },
            ],
          },
        ],
        USER,
      );
      assert.deepEqual(simulation, {
        status: SIMULATION_STATUS.REVERTED,
        revertReason: 'out of gas',
      });
    });

    it('treats an empty result as unavailable', function () {
      assert.equal(
        parseSimulationResult([], USER).status,
        SIMULATION_STATUS.UNAVAILABLE,
      );
    });
  });

  describe('decodeRevertReason', function () {
    it('decodes Error(string) and Panic(uint256)', function () {
      assert.equal(decodeRevertReason(errorData('nope')), 'nope');
      assert.equal(
        decodeRevertReason(`0x4e487b71${word(0x11).slice(2)}`),
        'Panic(0x11)',
      );
      assert.equal(decodeRevertReason('0xdeadbeef'), undefined);
    });

    it('strips characters that could disguise the reason', function () {
      assert.equal(decodeRevertReason(errorData('a‮b\nc')), 'abc');
    });
  });

  describe('simulationFromError', function () {
    it('treats an unsupported method as unavailable', function () {
      assert.deepEqual(
        simulationFromError({
          code: -32601,
          message: 'the method eth_simulateV1 does not exist/is not available',
        }),
        { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'unsupported' },
      );
      assert.deepEqual(
        simulationFromError({ code: -32000, message: 'Method not found' }),
        { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'unsupported' },
      );
    });

    it('treats other RPC errors as unavailable', function () {
      assert.deepEqual(
        simulationFromError({ code: -32603, message: 'Internal error' }),
        { status: SIMULATION_STATUS.UNAVAILABLE, reason: 'error' },
      );
    });

    it('reports a top-level execution failure as likely to fail', function () {
      assert.deepEqual(
        simulationFromError({
          code: 3,
          message: 'execution reverted',
          data: errorData('paused'),
        }),
        { status: SIMULATION_STATUS.REVERTED, revertReason: 'paused' },
      );
    });
  });

  describe('simulateTransaction', function () {
    const txParams = { from: USER, to: TOKEN, value: '0x0', data: '0x' };

    it('reads token details through the same provider', async function () {
      const symbolCall = encodeCall('symbol()');
      const decimalsCall = encodeCall('decimals()');
      const calls = [];
      const query = {
        call: async ({ to, data }) => {
          calls.push(to);
          if (data === symbolCall) {
            return bytesToHex(encode(['string'], ['TKN']));
          }
          if (data === decimalsCall) {
            return word(6);
          }
          throw new Error('unexpected call');
        },
      };
      const simulation = await simulateTransaction({
        txParams,
        request: async (method, params) => {
          assert.equal(method, 'eth_simulateV1');
          assert.deepEqual(params, buildSimulationParams(txParams));
          return success([transfer(TOKEN, USER, OTHER, 1500000)]);
        },
        query,
      });
      assert.equal(simulation.status, SIMULATION_STATUS.SUCCESS);
      assert.deepEqual(simulation.tokens, {
        [TOKEN]: { symbol: 'TKN', decimals: 6 },
      });
      assert.ok(calls.every((to) => to === TOKEN));
      assert.equal(typeof simulation.simulatedAt, 'number');
    });

    it('leaves out details a token does not provide', async function () {
      const simulation = await simulateTransaction({
        txParams,
        request: async () => success([transfer(TOKEN, USER, OTHER, 1)]),
        query: {
          call: async () => {
            throw new Error('execution reverted');
          },
        },
      });
      assert.deepEqual(simulation.tokens, {});
      assert.equal(simulation.changes[0].amount, '-1');
    });

    it('reports a node without eth_simulateV1 as unavailable', async function () {
      const simulation = await simulateTransaction({
        txParams,
        request: async () => {
          const error = new Error('Method not found');
          error.code = -32601;
          throw error;
        },
      });
      assert.equal(simulation.status, SIMULATION_STATUS.UNAVAILABLE);
      assert.equal(simulation.reason, 'unsupported');
    });

    it('times out', async function () {
      const started = Date.now();
      const simulation = await simulateTransaction({
        txParams,
        request: () => new Promise(() => undefined),
        timeoutMs: 20,
      });
      assert.equal(simulation.status, SIMULATION_STATUS.UNAVAILABLE);
      assert.equal(simulation.reason, 'timeout');
      assert.ok(Date.now() - started < 1000);
    });
  });
});
