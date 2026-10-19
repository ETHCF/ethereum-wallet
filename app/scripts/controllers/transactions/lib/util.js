import { addHexPrefix, isValidAddress } from '@ethereumjs/util';

import { isFeeMarketTransaction } from '../../../lib/transaction-fees';
import { hexToBn } from '../../../lib/util';

const normalizers = {
  from: (from) => addHexPrefix(from),
  to: (to, lowerCase) =>
    lowerCase ? addHexPrefix(to).toLowerCase() : addHexPrefix(to),
  nonce: (nonce) => addHexPrefix(nonce),
  value: (value) => addHexPrefix(value),
  data: (data) => addHexPrefix(data),
  gas: (gas) => addHexPrefix(gas),
  gasPrice: (gasPrice) => addHexPrefix(gasPrice),
};

// Copied as-is, even when falsy, for validateEnvelope to check.
const PASSTHROUGH_FIELDS = [
  'type',
  'chainId',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'accessList',
  'authorizationList',
];

/**
 * Normalizes the given txParams
 *
 * @param {object} txParams - The transaction params
 * @param {boolean} [lowerCase] - Whether to lowercase the 'to' address.
 * Default: true
 * @returns {object} the normalized tx params
 */
export function normalizeTxParams(txParams, lowerCase = true) {
  for (const field of [
    'blobs',
    'blobVersionedHashes',
    'maxFeePerBlobGas',
    'kzg',
    'commitments',
    'proofs',
  ]) {
    if (Reflect.has(txParams, field)) {
      throw new Error('Blob transactions are not supported');
    }
  }
  // apply only known keys
  const normalizedTxParams = {};
  for (const key in normalizers) {
    if (txParams[key]) {
      // A number would be signed as decimal but shown as hex, so a site could
      // display one amount and sign another. Hex strings only, as upstream.
      if (typeof txParams[key] !== 'string') {
        throw new Error(`Invalid ${key}: expected a hexadecimal string`);
      }
      normalizedTxParams[key] = normalizers[key](txParams[key], lowerCase);
    }
  }
  for (const key of PASSTHROUGH_FIELDS) {
    if (txParams[key] !== undefined) {
      normalizedTxParams[key] = txParams[key];
    }
  }
  if (normalizedTxParams.type === undefined) {
    if (normalizedTxParams.authorizationList !== undefined) {
      normalizedTxParams.type = '0x4';
    } else if (isFeeMarketTransaction(normalizedTxParams)) {
      normalizedTxParams.type = '0x2';
    } else if (normalizedTxParams.accessList !== undefined) {
      normalizedTxParams.type = '0x1';
    }
  }
  return normalizedTxParams;
}

/**
 * Validates the given tx parameters
 *
 * @param {object} txParams - the tx params
 * @throws {Error} if the tx params contains invalid fields
 */
export function validateTxParams(txParams) {
  validateFrom(txParams);
  validateRecipient(txParams);
  validateEnvelope(txParams);
  validateData(txParams.data);
  // A hex quantity also rules out a negative or fractional value.
  for (const field of ['nonce', 'value', 'gas', 'gasPrice']) {
    if (txParams[field] !== undefined) {
      quantity(txParams[field], field);
    }
  }
}

// The security checks and the confirmation read data as a hex string, but the
// signer converts it to bytes, padding odd-length hex with a leading zero. Data
// that is not whole bytes would be judged as one call and signed as another.
function validateData(data) {
  if (
    data !== undefined &&
    (typeof data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/u.test(data))
  ) {
    throw new Error('Invalid data: expected hexadecimal bytes');
  }
}

function quantity(value, field) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`Invalid ${field}: expected a hexadecimal quantity`);
  }
}

export function validateEnvelope(params) {
  for (const field of [
    'type',
    'chainId',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
  ]) {
    if (params[field] !== undefined) {
      quantity(params[field], field);
    }
  }
  const type = params.type === undefined ? undefined : Number(params.type);
  if (type !== undefined && ![0, 1, 2, 4].includes(type)) {
    throw new Error('Unsupported transaction type');
  }
  if (
    (isFeeMarketTransaction(params) ||
      params.authorizationList !== undefined) &&
    (params.gasPrice !== undefined || [0, 1].includes(type))
  ) {
    throw new Error(
      'EIP-1559 fees cannot be combined with gasPrice or a legacy/access-list transaction type',
    );
  }
  if (
    params.maxFeePerGas &&
    params.maxPriorityFeePerGas &&
    hexToBn(params.maxFeePerGas).lt(hexToBn(params.maxPriorityFeePerGas))
  ) {
    throw new Error('Maximum fee must be at least the priority fee');
  }
  if (params.accessList !== undefined) {
    if (type === 0 || !Array.isArray(params.accessList)) {
      throw new Error('Invalid access list');
    }
    for (const entry of params.accessList) {
      if (
        !entry ||
        !isValidAddress(entry.address) ||
        !Array.isArray(entry.storageKeys) ||
        entry.storageKeys.some(
          (key) => typeof key !== 'string' || !/^0x[0-9a-f]{64}$/iu.test(key),
        )
      ) {
        throw new Error('Invalid access list entry');
      }
    }
  }
  if (params.authorizationList !== undefined || type === 4) {
    if (
      (type !== undefined && type !== 4) ||
      !params.to ||
      !Array.isArray(params.authorizationList) ||
      !params.authorizationList.length
    ) {
      throw new Error(
        'EIP-7702 requires a recipient and a nonempty authorization list',
      );
    }
    for (const entry of params.authorizationList) {
      if (!entry || !isValidAddress(entry.address)) {
        throw new Error('Invalid authorization address');
      }
      for (const field of ['chainId', 'nonce', 'yParity', 'r', 's']) {
        quantity(entry[field], `authorization ${field}`);
      }
      if (![0, 1].includes(Number(entry.yParity))) {
        throw new Error('Invalid authorization yParity');
      }
    }
  }
}

/**
 * Validates the {@code from} field in the given tx params
 *
 * @param {object} txParams - the tx params
 * @throws {Error} if the from address isn't valid
 */
export function validateFrom(txParams) {
  if (!(typeof txParams.from === 'string')) {
    throw new Error(`Invalid from address ${txParams.from} not a string`);
  }
  if (!isValidAddress(txParams.from)) {
    throw new Error('Invalid from address');
  }
}

/**
 * Validates the {@code to} field in the given tx params
 *
 * @param {object} txParams - the tx params
 * @returns {object} the tx params
 * @throws {Error} if the recipient is invalid OR there isn't tx data
 */
export function validateRecipient(txParams) {
  // Without a recipient the transaction creates a contract from its data. With
  // no data either, that contract is empty and any value sent is lost.
  const hasData = Boolean(txParams.data) && txParams.data !== '0x';
  if (
    txParams.to === '0x' ||
    txParams.to === null ||
    txParams.to === undefined
  ) {
    if (hasData) {
      delete txParams.to;
    } else {
      throw new Error('Invalid recipient address');
    }
  } else if (!isValidAddress(txParams.to)) {
    throw new Error('Invalid recipient address');
  }
  return txParams;
}

/**
 * Returns a list of final states
 *
 * @returns {string[]} the states that can be considered final states
 */
export function getFinalStates() {
  return [
    'rejected', // the user has responded no!
    'confirmed', // the tx has been included in a block.
    'failed', // the tx failed for some reason, included on tx data.
    'dropped', // the tx nonce was already used
  ];
}
