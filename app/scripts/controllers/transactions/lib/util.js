import { addHexPrefix, isValidAddress } from '@ethereumjs/util';
import BN from 'bn.js';

import { isFeeMarketTransaction } from '../../../lib/transaction-fees';

const normalizers = {
  from: (from) => addHexPrefix(from),
  to: (to, lowerCase) =>
    lowerCase ? addHexPrefix(to).toLowerCase() : addHexPrefix(to),
  nonce: (nonce) => addHexPrefix(nonce),
  value: (value) => addHexPrefix(value),
  data: (data) => addHexPrefix(data),
  gas: (gas) => addHexPrefix(gas),
  gasPrice: (gasPrice) => addHexPrefix(gasPrice),
  type: (value) => value,
  chainId: (value) => value,
  maxFeePerGas: (value) => value,
  maxPriorityFeePerGas: (value) => value,
  accessList: (value) => value,
  authorizationList: (value) => value,
};

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
  // apply only keys in the normalizers
  const normalizedTxParams = {};
  for (const key in normalizers) {
    if (
      txParams[key] !== undefined &&
      (txParams[key] ||
        [
          'type',
          'chainId',
          'maxFeePerGas',
          'maxPriorityFeePerGas',
          'accessList',
          'authorizationList',
        ].includes(key))
    ) {
      normalizedTxParams[key] = normalizers[key](txParams[key], lowerCase);
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
  if (Reflect.has(txParams, 'value')) {
    const value = txParams.value.toString();
    if (value.includes('-')) {
      throw new Error(
        `Invalid transaction value of ${txParams.value} not a positive number.`,
      );
    }

    if (value.includes('.')) {
      throw new Error(
        `Invalid transaction value of ${txParams.value} number must be in wei`,
      );
    }
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
    new BN(params.maxFeePerGas.slice(2), 16).lt(
      new BN(params.maxPriorityFeePerGas.slice(2), 16),
    )
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
  if (txParams.to === '0x' || txParams.to === null) {
    if (txParams.data) {
      delete txParams.to;
    } else {
      throw new Error('Invalid recipient address');
    }
  } else if (txParams.to !== undefined && !isValidAddress(txParams.to)) {
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
