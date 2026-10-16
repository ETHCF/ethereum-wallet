import * as ethUtil from '@ethereumjs/util';
import BN from 'bn.js';

import { functionSelector, readArguments } from './abi-method-decoder';
import { toChecksumHexAddress } from './checksum-address';
import { getSignedTypedData } from './signed-typed-data';
import { parseQuantity } from './util';

// Every check here runs on this device, using data the wallet already has and
// the user's own RPC node. Nothing is sent to an outside analysis service.

export const SEVERITY = {
  DANGER: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const BURN_ADDRESSES = new Set([
  ZERO_ADDRESS,
  '0x000000000000000000000000000000000000dead',
]);

// Amounts at or above 2^128 are far beyond any real token supply, so they
// amount to an unlimited allowance.
const UNLIMITED = new BN(2).pow(new BN(128));
// Permits valid for longer than this are flagged.
const LONG_LIVED_SECONDS = 30 * 24 * 60 * 60;
const CODE_TIMEOUT_MS = 5000;
const ERC721_INTERFACE = '0x80ac58cd';

// Function selector -> how to read the call.
const CALLS = {
  a9059cbb: {
    kind: 'tokenTransfer',
    types: ['address', 'uint256'],
    recipient: 0,
  },
  '23b872dd': {
    kind: 'tokenTransfer',
    types: ['address', 'address', 'uint256'],
    recipient: 1,
  },
  '42842e0e': {
    kind: 'tokenTransfer',
    types: ['address', 'address', 'uint256'],
    recipient: 1,
  },
  b88d4fde: {
    kind: 'tokenTransfer',
    types: ['address', 'address', 'uint256', 'bytes'],
    recipient: 1,
  },
  f242432a: {
    kind: 'tokenTransfer',
    types: ['address', 'address', 'uint256', 'uint256', 'bytes'],
    recipient: 1,
  },
  '2eb2c2d6': {
    kind: 'tokenTransfer',
    types: ['address', 'address', 'uint256[]', 'uint256[]', 'bytes'],
    recipient: 1,
  },
  // ERC-20 approve(spender, amount), and ERC-721 approve(spender, tokenId),
  // which has the same selector.
  '095ea7b3': {
    kind: 'approve',
    types: ['address', 'uint256'],
    spender: 0,
    amount: 1,
    mayBeNft: true,
  },
  // increaseAllowance(spender, addedValue)
  39509351: {
    kind: 'approve',
    types: ['address', 'uint256'],
    spender: 0,
    amount: 1,
  },
  // increaseApproval(spender, addedValue), as older OpenZeppelin tokens name it
  d73dd623: {
    kind: 'approve',
    types: ['address', 'uint256'],
    spender: 0,
    amount: 1,
  },
  a22cb465: {
    kind: 'approveAll',
    types: ['address', 'bool'],
    spender: 0,
    approved: 1,
  },
  // Permit2 approve(token, spender, amount, expiration)
  '87517c45': {
    kind: 'approve',
    types: ['address', 'address', 'uint160', 'uint48'],
    spender: 1,
    amount: 2,
  },
};

function alert(id, severity, args = []) {
  return { id, severity, args };
}

/**
 * The alert shown when the checks themselves failed, as upstream shows one
 * when its security check errors. No alerts must never be mistaken for a
 * request that passed every check.
 *
 * @returns {object} The alert.
 */
export function checksFailedAlert() {
  return alert('alertSecurityChecksFailed', SEVERITY.WARNING);
}

const lower = (address) =>
  typeof address === 'string' ? address.toLowerCase() : undefined;

/**
 * Decodes a call this module understands. Arguments that are not encoded the
 * standard way are read as a contract that does not check them would read
 * them, and the call is marked malformed: contracts may disagree about what
 * such a call means.
 *
 * @param {string} data - Transaction data.
 * @returns {object | undefined} The call kind, whether it is malformed, and its
 * addresses and amounts when they can be read at all.
 */
export function decodeCall(data) {
  if (typeof data !== 'string' || data.length < 10) {
    return undefined;
  }
  const call = CALLS[data.slice(2, 10).toLowerCase()];
  if (!call) {
    return undefined;
  }
  const result = readArguments(call.types, data.slice(10));
  if (!result) {
    return { kind: call.kind, malformed: true };
  }
  const { values } = result;
  return {
    kind: call.kind,
    malformed: !result.canonical,
    recipient:
      call.recipient === undefined ? undefined : values[call.recipient],
    spender: call.spender === undefined ? undefined : values[call.spender],
    amount:
      call.amount === undefined
        ? undefined
        : new BN(values[call.amount].toString(10)),
    approved:
      call.approved === undefined ? undefined : Boolean(values[call.approved]),
    mayBeNft: Boolean(call.mayBeNft),
  };
}

/**
 * Whether `candidate` mimics `known`: same leading and trailing characters
 * (the parts wallets and explorers show), but a different address.
 *
 * @param {string} candidate - The address to check.
 * @param {string} known - An address the user knows.
 * @returns {boolean} Whether `candidate` looks like `known` without being it.
 */
export function isLookalike(candidate, known) {
  const a = lower(candidate);
  const b = lower(known);
  return (
    Boolean(a && b) &&
    a !== b &&
    a.slice(2, 6) === b.slice(2, 6) &&
    a.slice(-4) === b.slice(-4)
  );
}

async function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CODE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function hasCode(getCode, address) {
  const code = await withTimeout(getCode(address));
  return Boolean(code) && code !== '0x' && code !== '0x0';
}

/**
 * Whether a contract says it is an ERC-721 collection (ERC-165). Contracts
 * that do not implement ERC-165, such as most ERC-20 tokens, revert or return
 * nothing, and are not ERC-721.
 *
 * @param {Function} [call] - Calls a read-only contract function, as
 * contract-call.js's callContract does, via the user's RPC.
 * @param {string} address - The contract.
 * @returns {Promise<boolean>} Whether it is an ERC-721 contract.
 */
async function isErc721(call, address) {
  if (!call) {
    return false;
  }
  try {
    const [supported] = await withTimeout(
      call(address, 'supportsInterface(bytes4)', ['bool'], [ERC721_INTERFACE]),
    );
    return supported === true;
  } catch (_) {
    return false;
  }
}

/**
 * Checks the address funds are sent to.
 *
 * @param {object} context - The address to check and what the user knows.
 * @param {string} context.recipient - The receiving address.
 * @param {Set<string>} context.ownAccounts - Lower-case addresses of the user's accounts.
 * @param {Set<string>} context.knownAddresses - Lower-case contacts and previous recipients.
 * @param {Set<string>} context.tokenContracts - Lower-case token contracts the user tracks.
 * @returns {object[]} Alerts about the recipient.
 */
function checkRecipient({
  recipient,
  ownAccounts,
  knownAddresses,
  tokenContracts,
}) {
  const address = lower(recipient);
  if (BURN_ADDRESSES.has(address)) {
    return [alert('alertBurnAddress', SEVERITY.DANGER)];
  }
  if (ownAccounts.has(address)) {
    return [];
  }
  const alerts = [];
  if (tokenContracts.has(address)) {
    alerts.push(alert('alertRecipientIsKnownToken', SEVERITY.DANGER));
  }
  const familiar = [...ownAccounts, ...knownAddresses].find((known) =>
    isLookalike(address, known),
  );
  if (familiar) {
    alerts.push(
      alert('alertLookalikeAddress', SEVERITY.DANGER, [
        toChecksumHexAddress(familiar),
      ]),
    );
  } else if (!knownAddresses.has(address)) {
    alerts.push(alert('alertFirstTimeRecipient', SEVERITY.INFO));
  }
  return alerts;
}

/**
 * Checks an address that is being given permission to spend the user's assets.
 *
 * @param {object} context - The address to check and what the user knows.
 * @param {string} context.spender - The address being given permission.
 * @param {Function} context.getCode - Returns the code at an address, via the user's RPC.
 * @param {Set<string>} context.ownAccounts - Lower-case addresses of the user's accounts.
 * @returns {Promise<object[]>} Alerts about the spender.
 */
async function checkSpender({ spender, getCode, ownAccounts }) {
  if (ownAccounts.has(lower(spender))) {
    return [];
  }
  try {
    if (!(await hasCode(getCode, spender))) {
      return [
        alert('alertSpenderNotContract', SEVERITY.DANGER, [
          toChecksumHexAddress(spender),
        ]),
      ];
    }
    return [];
  } catch (_) {
    // A spender that could not be checked is not known to be safe. The check
    // this replaces is a DANGER alert, so burying its absence in an INFO note
    // would quietly remove a safeguard whenever the network is unreachable.
    return [
      alert('alertCodeCheckFailed', SEVERITY.WARNING, [
        toChecksumHexAddress(spender),
      ]),
    ];
  }
}

function sortAlerts(alerts) {
  const order = [SEVERITY.DANGER, SEVERITY.WARNING, SEVERITY.INFO];
  return alerts.sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );
}

/**
 * Checks a transaction before it is shown for confirmation.
 *
 * @param {object} options - The transaction and what the user knows.
 * @param {object} options.txParams - The transaction.
 * @param {Function} options.getCode - Returns the code at an address, via the user's RPC.
 * @param {Function} [options.call] - Calls a read-only contract function
 * (address, signature, outputTypes, args), via the user's RPC.
 * @param {Set<string>} options.ownAccounts - Lower-case addresses of the user's accounts.
 * @param {Set<string>} options.knownAddresses - Lower-case contacts and previous recipients.
 * @param {Set<string>} options.tokenContracts - Lower-case token contracts the user tracks.
 * @returns {Promise<object[]>} Alerts, most severe first.
 */
export async function getTransactionAlerts({
  txParams,
  getCode,
  call: callContract,
  ownAccounts,
  knownAddresses,
  tokenContracts,
}) {
  const { to, data } = txParams;
  if (!to) {
    return [];
  }
  const hasData = typeof data === 'string' && data !== '0x' && data !== '';
  const call = hasData ? decodeCall(data) : undefined;
  const context = { getCode, ownAccounts, knownAddresses, tokenContracts };
  const alerts = [];

  if (!hasData) {
    alerts.push(...checkRecipient({ ...context, recipient: to }));
    return sortAlerts(alerts);
  }

  try {
    if (!(await hasCode(getCode, to))) {
      alerts.push(
        alert('alertDataToNonContract', SEVERITY.WARNING, [
          toChecksumHexAddress(to),
        ]),
      );
    }
  } catch (_) {
    alerts.push(
      alert('alertCodeCheckFailed', SEVERITY.WARNING, [
        toChecksumHexAddress(to),
      ]),
    );
  }

  if (call?.malformed) {
    alerts.push(alert('alertMalformedTokenCall', SEVERITY.DANGER));
  }

  if (call?.kind === 'tokenTransfer' && call.recipient) {
    if (lower(call.recipient) === lower(to)) {
      alerts.push(alert('alertRecipientIsTokenContract', SEVERITY.DANGER));
    } else {
      alerts.push(...checkRecipient({ ...context, recipient: call.recipient }));
    }
  } else if (
    call?.kind === 'approve' &&
    call.amount &&
    call.mayBeNft &&
    (await isErc721(callContract, to))
  ) {
    // ERC-721 approve(spender, tokenId): token 0 is a token like any other,
    // and approving the zero address is how a single approval is revoked.
    if (lower(call.spender) !== ZERO_ADDRESS) {
      alerts.push(
        alert('alertApproveNft', SEVERITY.WARNING, [
          toChecksumHexAddress(call.spender),
          call.amount.toString(10),
        ]),
      );
      alerts.push(
        ...(await checkSpender({ ...context, spender: call.spender })),
      );
    }
  } else if (call?.kind === 'approve' && call.amount && !call.amount.isZero()) {
    if (call.amount.gte(UNLIMITED)) {
      alerts.push(
        alert('alertUnlimitedApproval', SEVERITY.WARNING, [
          toChecksumHexAddress(call.spender),
        ]),
      );
    }
    alerts.push(...(await checkSpender({ ...context, spender: call.spender })));
  } else if (call?.kind === 'approveAll' && call.spender && call.approved) {
    alerts.push(
      alert('alertApproveAllNfts', SEVERITY.DANGER, [
        toChecksumHexAddress(call.spender),
      ]),
    );
    alerts.push(...(await checkSpender({ ...context, spender: call.spender })));
  }
  return sortAlerts(alerts);
}

const isAddress = (value) =>
  typeof value === 'string' && ethUtil.isValidAddress(value);

const DAI_PERMIT_FIELDS = [
  { name: 'holder', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiry', type: 'uint256' },
  { name: 'allowed', type: 'bool' },
];

/**
 * Reads token spending permissions out of typed data: EIP-2612 and DAI
 * permits, and Uniswap Permit2 approvals and transfers.
 *
 * @param {object} typedData - The parsed typed data.
 * @returns {object | undefined} The spender, amounts and expiry, if this is a permit.
 */
export function decodePermit(typedData) {
  const { primaryType, types } = typedData || {};
  // EIP-712 ignores undeclared fields. They must not change the warnings
  // either, including fields nested inside Permit2 details and transfers.
  const { message } = getSignedTypedData(typedData || {});
  if (!message || typeof message !== 'object' || !isAddress(message.spender)) {
    return undefined;
  }
  const { spender } = message;
  switch (primaryType) {
    case 'Permit':
      if (
        Array.isArray(types?.Permit) &&
        types.Permit.length === DAI_PERMIT_FIELDS.length &&
        DAI_PERMIT_FIELDS.every(
          ({ name, type }, index) =>
            types.Permit[index]?.name === name &&
            types.Permit[index]?.type === type,
        )
      ) {
        // DAI-style: all or nothing; expiry 0 never expires.
        return {
          spender,
          unlimited: message.allowed === true,
          expiry: parseQuantity(message.expiry),
          revokes: message.allowed === false,
        };
      }
      return {
        spender,
        amounts: [parseQuantity(message.value)],
        expiry: parseQuantity(message.deadline),
      };
    case 'PermitSingle':
    case 'PermitBatch': {
      const details = [].concat(message.details || []);
      return {
        spender,
        amounts: details.map((detail) => parseQuantity(detail?.amount)),
        expiry: [
          parseQuantity(message.sigDeadline),
          ...details.map((detail) => parseQuantity(detail?.expiration)),
        ].reduce(
          (latest, value) =>
            value && (!latest || value.gt(latest)) ? value : latest,
          undefined,
        ),
      };
    }
    case 'PermitTransferFrom':
    case 'PermitBatchTransferFrom':
    case 'PermitWitnessTransferFrom':
    case 'PermitBatchWitnessTransferFrom':
      return {
        spender,
        amounts: []
          .concat(message.permitted || [])
          .map((permitted) => parseQuantity(permitted?.amount)),
        expiry: parseQuantity(message.deadline),
      };
    default:
      return undefined;
  }
}

// Marketplace orders. Nothing is priced: a payment is "next to nothing" when it
// is a tiny number of the currency's base units, or a tiny share of the same
// currency the order gives away.

// 0.0001 of an 18-decimal currency.
const NEGLIGIBLE_18_DECIMALS = new BN(10).pow(new BN(14));
// For a token whose decimals are unknown: next to nothing for any token in
// practical use, even one with 6 decimals.
const NEGLIGIBLE_TOKEN_UNITS = new BN(1000);
// Getting back less than 1/100 of the currency given is next to nothing.
const NEGLIGIBLE_SHARE = 100;
// 18-decimal payment tokens that marketplace orders commonly use.
const KNOWN_18_DECIMAL_TOKENS = new Set([
  // WETH on Ethereum mainnet
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  // Blur Pool (ETH deposited with Blur)
  '0x0000000000a39bb272e79075ade125fd351887ac',
]);
// Orders valid for longer than this are flagged.
const LONG_LIVED_ORDER_SECONDS = 365 * 24 * 60 * 60;
const BASIS_POINTS = new BN(10000);
const MAX_LISTED_ITEMS = 5;
const MAX_BULK_ORDERS = 4096;
const MAX_TREE_DEPTH = 24;
// Seaport ItemType: NATIVE, ERC20, ERC721, ERC1155, ERC721_WITH_CRITERIA and
// ERC1155_WITH_CRITERIA.
const SEAPORT_ITEM_KINDS = [
  'native',
  'erc20',
  'erc721',
  'erc1155',
  'erc721',
  'erc1155',
];
const SEAPORT_VERSIONS = new Set(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6']);

const isHexData = (value) =>
  typeof value === 'string' && /^0x(?:[0-9a-f]{2})*$/iu.test(value);

function formatUnits(amount, decimals = 18) {
  const base = new BN(10).pow(new BN(decimals));
  const whole = amount.div(base).toString(10);
  const fraction = amount
    .mod(base)
    .toString(10)
    .padStart(decimals, '0')
    .replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

const currencyKey = (item) =>
  item.kind === 'native' ? 'native' : `${item.kind}:${lower(item.token)}`;

const isFungible = (item) => item.kind === 'native' || item.kind === 'erc20';

function describeItem({ kind, token, id, amount, criteria }) {
  const contract = token ? toChecksumHexAddress(token) : '';
  const tokenId = criteria ? '*' : `#${id?.toString(10)}`;
  switch (kind) {
    case 'native':
      return `${formatUnits(amount)} native`;
    case 'erc20':
      return KNOWN_18_DECIMAL_TOKENS.has(lower(token))
        ? `${formatUnits(amount)} ERC-20 ${contract}`
        : `${amount.toString(10)} ERC-20 ${contract}`;
    case 'erc721':
      return `ERC-721 ${contract} ${tokenId}`;
    case 'erc1155':
      return `${amount.toString(10)} × ERC-1155 ${contract} ${tokenId}`;
    default:
      return amount.eqn(1)
        ? `NFT ${contract} ${tokenId}`
        : `${amount.toString(10)} × NFT ${contract} ${tokenId}`;
  }
}

function describeItems(items) {
  const shown = items.slice(0, MAX_LISTED_ITEMS).map(describeItem);
  if (items.length > MAX_LISTED_ITEMS) {
    shown.push(`+${items.length - MAX_LISTED_ITEMS}`);
  }
  return shown.join(', ');
}

function paymentItem(token, amount) {
  return lower(token) === ZERO_ADDRESS
    ? { kind: 'native', amount }
    : { kind: 'erc20', token, amount };
}

function flattenTree(tree, depth = 0, out = []) {
  if (!Array.isArray(tree)) {
    out.push(tree);
  } else if (depth <= MAX_TREE_DEPTH) {
    tree.forEach((node) => flattenTree(node, depth + 1, out));
  } else {
    throw new Error('Order tree is too deep');
  }
  if (out.length > MAX_BULK_ORDERS) {
    throw new Error('Too many orders');
  }
  return out;
}

function readSeaportItem(raw) {
  if (!raw || typeof raw !== 'object' || !isAddress(raw.token)) {
    return undefined;
  }
  const itemType = parseQuantity(raw.itemType);
  const id = parseQuantity(raw.identifierOrCriteria);
  const start = parseQuantity(raw.startAmount);
  const end = parseQuantity(raw.endAmount);
  if (!itemType || itemType.gtn(5) || !id || !start || !end) {
    return undefined;
  }
  const criteria = itemType.gten(4);
  return {
    kind: SEAPORT_ITEM_KINDS[itemType.toNumber()],
    token: raw.token,
    id,
    criteria,
    // Criteria 0 lets whoever fills the order pick any token of the contract.
    wildcard: criteria && id.isZero(),
    start,
    end,
    recipient: raw.recipient,
  };
}

function readSeaportOrder(message, marketplace, ownAccounts) {
  if (
    !message ||
    typeof message !== 'object' ||
    !isAddress(message.offerer) ||
    !Array.isArray(message.offer) ||
    !Array.isArray(message.consideration)
  ) {
    return undefined;
  }
  const offer = message.offer.map(readSeaportItem);
  const consideration = message.consideration.map(readSeaportItem);
  const endTime = parseQuantity(message.endTime);
  if ([...offer, ...consideration].some((item) => !item) || !endTime) {
    return undefined;
  }
  // The signer gives the offer and is paid what goes to the offerer.
  const isSigner = (address) =>
    isAddress(address) &&
    (lower(address) === lower(message.offerer) ||
      ownAccounts.has(lower(address)));
  const others = consideration.filter((item) => !isSigner(item.recipient));
  return {
    marketplace,
    // The most the signer may give, and the least they are sure to get.
    give: offer.map((item) => ({
      ...item,
      amount: BN.max(item.start, item.end),
    })),
    receive: consideration
      .filter((item) => isSigner(item.recipient))
      .map((item) => ({ ...item, amount: BN.min(item.start, item.end) })),
    wildcardToOthers: others.length > 0 && offer.some((item) => item.wildcard),
    endTime,
  };
}

function readBlurOrder(message) {
  const side = parseQuantity(message.side);
  const tokenId = parseQuantity(message.tokenId);
  const amount = parseQuantity(message.amount);
  const price = parseQuantity(message.price);
  const endTime = parseQuantity(message.expirationTime);
  const rates = []
    .concat(message.fees || [])
    .map((fee) => parseQuantity(fee?.rate));
  if (
    !side ||
    side.gtn(1) ||
    !tokenId ||
    !amount ||
    !price ||
    !endTime ||
    rates.some((rate) => !rate) ||
    !isAddress(message.collection) ||
    !isAddress(message.paymentToken)
  ) {
    return undefined;
  }
  const nft = {
    kind: 'nft',
    token: message.collection,
    id: tokenId,
    amount: amount.isZero() ? new BN(1) : amount,
  };
  if (side.isZero()) {
    // A bid: the signer pays the price and gets the NFT.
    return {
      marketplace: 'Blur',
      give: [paymentItem(message.paymentToken, price)],
      receive: [nft],
      endTime,
    };
  }
  // A listing: the fees are paid out of the price.
  const totalRate = rates.reduce((sum, rate) => sum.add(rate), new BN(0));
  const proceeds = totalRate.gte(BASIS_POINTS)
    ? new BN(0)
    : price.mul(BASIS_POINTS.sub(totalRate)).div(BASIS_POINTS);
  return {
    marketplace: 'Blur',
    give: [nft],
    receive: [paymentItem(message.paymentToken, proceeds)],
    endTime,
  };
}

function readLooksRareOrder(message) {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const quoteType = parseQuantity(message.quoteType);
  const collectionType = parseQuantity(message.collectionType);
  const price = parseQuantity(message.price);
  const endTime = parseQuantity(message.endTime);
  const itemIds = [].concat(message.itemIds || []).map(parseQuantity);
  const amounts = [].concat(message.amounts || []).map(parseQuantity);
  if (
    !quoteType ||
    quoteType.gtn(1) ||
    !collectionType ||
    !price ||
    !endTime ||
    [...itemIds, ...amounts].some((value) => !value) ||
    !isAddress(message.collection) ||
    !isAddress(message.currency)
  ) {
    return undefined;
  }
  const kind = collectionType.eqn(1) ? 'erc1155' : 'erc721';
  const nfts = itemIds.map((id, index) => ({
    kind,
    token: message.collection,
    id,
    amount: amounts[index] || new BN(1),
  }));
  const payment = paymentItem(message.currency, price);
  // QuoteType 1 is an ask (a listing), 0 a bid.
  return quoteType.eqn(1)
    ? { marketplace: 'LooksRare', give: nfts, receive: [payment], endTime }
    : { marketplace: 'LooksRare', give: [payment], receive: nfts, endTime };
}

/**
 * Reads NFT marketplace orders out of typed data: Seaport orders and bulk
 * orders, Blur orders, and LooksRare v2 orders and batches.
 *
 * @param {object} typedData - The parsed typed data.
 * @param {Set<string>} [ownAccounts] - Lower-case addresses of the user's accounts.
 * @returns {object | undefined} The orders, `hidden` for a signature over
 * orders that are not shown, or `unreadable`; undefined if this is not a
 * marketplace order.
 */
export function decodeOrders(typedData, ownAccounts = new Set()) {
  const { primaryType, domain, message } = typedData || {};
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const name = domain?.name;
  let orders;
  switch (primaryType) {
    case 'OrderComponents':
    case 'BulkOrder': {
      const marketplace = SEAPORT_VERSIONS.has(domain?.version)
        ? `Seaport ${domain.version}`
        : 'Seaport';
      if (primaryType === 'BulkOrder') {
        if (!Array.isArray(message.tree)) {
          return undefined;
        }
        orders = flattenTree(message.tree).map((order) =>
          readSeaportOrder(order, marketplace, ownAccounts),
        );
      } else if (
        Array.isArray(message.offer) &&
        Array.isArray(message.consideration)
      ) {
        orders = [readSeaportOrder(message, marketplace, ownAccounts)];
      } else {
        return undefined;
      }
      break;
    }
    case 'Root':
      // Blur bulk listings sign only the Merkle root of the orders, so what is
      // being agreed to cannot be shown.
      return Object.hasOwn(message, 'tree') && !Array.isArray(message.tree)
        ? { hidden: true }
        : undefined;
    case 'Order':
      if (name !== 'Blur Exchange') {
        return undefined;
      }
      orders = [readBlurOrder(message)];
      break;
    case 'Maker':
    case 'BatchOrder':
      if (name !== 'LooksRareProtocol') {
        return undefined;
      }
      if (primaryType === 'BatchOrder') {
        if (!Array.isArray(message.tree)) {
          return undefined;
        }
        orders = flattenTree(message.tree).map(readLooksRareOrder);
      } else {
        orders = [readLooksRareOrder(message)];
      }
      break;
    default:
      return undefined;
  }
  return orders.some((order) => !order) ? { unreadable: true } : { orders };
}

/**
 * The payments to the signer, with payments in the same currency added up.
 *
 * @param {object[]} items - What the signer receives.
 * @returns {object[]} The items, one per currency.
 */
function totalPayments(items) {
  const totals = new Map();
  const result = [];
  for (const item of items) {
    if (isFungible(item)) {
      const key = currencyKey(item);
      const total = totals.get(key);
      if (total) {
        total.amount = total.amount.add(item.amount);
      } else {
        const copy = { ...item };
        totals.set(key, copy);
        result.push(copy);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

function isNegligible(item, give) {
  if (item.amount.isZero()) {
    return true;
  }
  if (!isFungible(item)) {
    return false;
  }
  const given = give
    .filter((offered) => currencyKey(offered) === currencyKey(item))
    .reduce((sum, offered) => sum.add(offered.amount), new BN(0));
  if (!given.isZero()) {
    return item.amount.muln(NEGLIGIBLE_SHARE).lt(given);
  }
  const threshold =
    item.kind === 'native' || KNOWN_18_DECIMAL_TOKENS.has(lower(item.token))
      ? NEGLIGIBLE_18_DECIMALS
      : NEGLIGIBLE_TOKEN_UNITS;
  return item.amount.lt(threshold);
}

function getOrderAlerts(order, nowSeconds) {
  const give = order.give.filter((item) => !item.amount.isZero());
  const receive = totalPayments(order.receive).filter(
    (item) => !item.amount.isZero(),
  );
  if (!give.length && !receive.length) {
    // Bulk orders are padded with empty orders.
    return [];
  }
  const alerts = [];
  const given = describeItems(give);
  if (give.length && receive.every((item) => isNegligible(item, give))) {
    alerts.push(alert('alertOrderFreeListing', SEVERITY.DANGER, [given]));
  }
  if (order.wildcardToOthers) {
    alerts.push(alert('alertOrderWildcardOffer', SEVERITY.WARNING));
  }
  if (order.endTime.gt(nowSeconds.addn(LONG_LIVED_ORDER_SECONDS))) {
    alerts.push(alert('alertOrderLongLived', SEVERITY.WARNING));
  }
  alerts.push(
    receive.length
      ? alert('alertOrderSummary', SEVERITY.INFO, [
          order.marketplace,
          given || '0',
          describeItems(receive),
        ])
      : alert('alertOrderSummaryNothing', SEVERITY.INFO, [
          order.marketplace,
          given,
        ]),
  );
  return alerts;
}

function getMarketplaceAlerts(typedData, ownAccounts, nowSeconds) {
  const decoded = decodeOrders(typedData, ownAccounts);
  if (!decoded) {
    return [];
  }
  if (decoded.hidden) {
    return [alert('alertBulkSignatureHidden', SEVERITY.DANGER)];
  }
  if (decoded.unreadable) {
    return [checksFailedAlert()];
  }
  const seen = new Set();
  return decoded.orders
    .flatMap((order) => getOrderAlerts(order, nowSeconds))
    .filter(({ id, args }) => {
      const key = `${id}:${args.join('|')}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

// Safe (Gnosis Safe) transactions.

// MultiSend and MultiSendCallOnly, which Safe apps delegatecall to batch
// calls. Canonical deployments of v1.3.0 (also the eip155 variants) and
// v1.4.1. Delegatecalls to these are expected; their batches are checked.
const SAFE_MULTISEND = new Set([
  // v1.3.0 MultiSend, MultiSendCallOnly
  '0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761',
  '0x40a2accbd92bca938b02010e17a5b8929b49130d',
  // v1.3.0 eip155 MultiSend, MultiSendCallOnly
  '0x998739bfdaadde7c933b942a68053933098f9eda',
  '0xa1dabef33b3b82c7814b6d82a79e50f4ac44102b',
  // v1.4.1 MultiSend, MultiSendCallOnly
  '0x38869bf66a61cf6bdb996a6ae40d5853fd43b526',
  '0x9641d764fc13c8b624c04430c7356c1c7c8102e2',
]);
const MULTISEND_SELECTOR = functionSelector('multiSend(bytes)');
// Safe functions that change who controls the Safe or what can act for it.
const SAFE_SELF_CALLS = new Map(
  [
    'addOwnerWithThreshold(address,uint256)',
    'removeOwner(address,address,uint256)',
    'swapOwner(address,address,address)',
    'changeThreshold(uint256)',
    'enableModule(address)',
    'disableModule(address,address)',
    'setGuard(address)',
    'setFallbackHandler(address)',
  ].map((signature) => [
    functionSelector(signature),
    signature.slice(0, signature.indexOf('(')),
  ]),
);
const OPERATION = { CALL: 0, DELEGATECALL: 1 };

/**
 * Reads the calls batched in MultiSend's multiSend(bytes): each is the
 * operation (1 byte), to (20), value (32), data length (32) and data.
 *
 * @param {string} data - The call data.
 * @returns {object[] | undefined} The calls, or undefined if they cannot be read.
 */
export function decodeMultiSend(data) {
  if (
    !isHexData(data) ||
    data.slice(2, 10).toLowerCase() !== MULTISEND_SELECTOR
  ) {
    return undefined;
  }
  const result = readArguments(['bytes'], data.slice(10));
  if (!result?.canonical) {
    return undefined;
  }
  const bytes = Buffer.from(result.values[0]);
  const calls = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset + 85;
    if (start > bytes.length || bytes[offset] > OPERATION.DELEGATECALL) {
      return undefined;
    }
    const length = new BN(bytes.subarray(offset + 53, start));
    if (length.gtn(bytes.length - start)) {
      return undefined;
    }
    const end = start + length.toNumber();
    calls.push({
      operation: bytes[offset],
      to: `0x${bytes.subarray(offset + 1, offset + 21).toString('hex')}`,
      value: new BN(bytes.subarray(offset + 21, offset + 53)),
      data: `0x${bytes.subarray(start, end).toString('hex')}`,
    });
    offset = end;
  }
  return calls;
}

function getSafeCallAlerts({ safe, to, operation, data }, nested = false) {
  const alerts = [];
  if (operation === OPERATION.DELEGATECALL) {
    if (!nested && SAFE_MULTISEND.has(lower(to))) {
      const calls = decodeMultiSend(data);
      if (calls) {
        alerts.push(
          ...calls.flatMap((call) =>
            getSafeCallAlerts({ safe, ...call }, true),
          ),
        );
      } else {
        alerts.push(alert('alertSafeBatchUnreadable', SEVERITY.DANGER));
      }
    } else {
      alerts.push(
        alert('alertSafeDelegateCall', SEVERITY.DANGER, [
          toChecksumHexAddress(to),
        ]),
      );
    }
  }
  if (safe && lower(to) === lower(safe) && data.length > 2) {
    const selector = data.slice(2, 10).toLowerCase();
    alerts.push(
      alert('alertSafeSelfCall', SEVERITY.WARNING, [
        SAFE_SELF_CALLS.get(selector) || `0x${selector}`,
      ]),
    );
  }
  return alerts;
}

function getSafeAlerts(typedData) {
  const { primaryType, domain, message } = typedData || {};
  if (primaryType !== 'SafeTx' || !message || typeof message !== 'object') {
    return [];
  }
  const safe = isAddress(domain?.verifyingContract)
    ? domain.verifyingContract
    : undefined;
  const value = parseQuantity(message.value);
  const operation = parseQuantity(message.operation);
  const data = message.data ?? '0x';
  if (
    !isAddress(message.to) ||
    !value ||
    !operation ||
    operation.gtn(OPERATION.DELEGATECALL) ||
    !isHexData(data)
  ) {
    return [checksFailedAlert()];
  }
  const tx = { safe, to: message.to, operation: operation.toNumber(), data };
  return [
    ...getSafeCallAlerts(tx),
    alert('alertSafeTxSummary', SEVERITY.INFO, [
      safe ? toChecksumHexAddress(safe) : '?',
      tx.operation === OPERATION.DELEGATECALL ? 'delegatecall' : 'call',
      toChecksumHexAddress(message.to),
      formatUnits(value),
      String((data.length - 2) / 2),
    ]),
  ];
}

/**
 * Checks typed data before it is shown for signing.
 *
 * @param {object} options - The typed data and what the user knows.
 * @param {string} options.data - The typed data as JSON.
 * @param {Function} options.getCode - Returns the code at an address, via the user's RPC.
 * @param {Set<string>} options.ownAccounts - Lower-case addresses of the user's accounts.
 * @param {number} [options.now] - The current time in milliseconds.
 * @returns {Promise<object[]>} Alerts, most severe first.
 */
export async function getTypedDataAlerts({
  data,
  getCode,
  ownAccounts,
  now = Date.now(),
}) {
  let typedData;
  let permit;
  try {
    typedData = typeof data === 'string' ? JSON.parse(data) : data;
    permit = decodePermit(typedData);
  } catch (_) {
    // Data that cannot be read might be a permit, so it was not checked.
    return [checksFailedAlert()];
  }
  const nowSeconds = new BN(Math.floor(now / 1000));
  if (!permit) {
    try {
      return sortAlerts([
        ...getMarketplaceAlerts(typedData, ownAccounts, nowSeconds),
        ...getSafeAlerts(typedData),
      ]);
    } catch (_) {
      return [checksFailedAlert()];
    }
  }
  if (permit.revokes) {
    return [];
  }
  const spender = toChecksumHexAddress(permit.spender);
  const alerts = [alert('alertPermitSignature', SEVERITY.WARNING, [spender])];
  if (
    permit.unlimited ||
    (permit.amounts || []).some((amount) => !amount || amount.gte(UNLIMITED))
  ) {
    alerts.push(alert('alertUnlimitedApproval', SEVERITY.WARNING, [spender]));
  }
  if (
    !permit.expiry ||
    permit.expiry.isZero() ||
    permit.expiry.gt(nowSeconds.addn(LONG_LIVED_SECONDS))
  ) {
    alerts.push(alert('alertLongLivedPermit', SEVERITY.WARNING));
  }
  alerts.push(
    ...(await checkSpender({ spender: permit.spender, getCode, ownAccounts })),
  );
  return sortAlerts(alerts);
}
