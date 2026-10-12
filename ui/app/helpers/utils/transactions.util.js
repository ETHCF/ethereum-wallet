import * as ethUtil from '@ethereumjs/util';
import { MethodRegistry } from 'eth-method-registry';
import abi from 'human-standard-token-abi';
import log from 'loglevel';

import { addCurrencies } from './conversion-util';
import fetchWithCache from './fetch-with-cache';
import {
  TRANSACTION_TYPE_CANCEL,
  TRANSACTION_STATUS_CONFIRMED,
} from '../../../../app/scripts/controllers/transactions/enums';
import createMethodDecoder from '../../../../app/scripts/lib/abi-method-decoder';
import { MESSAGE_TYPE } from '../../../../app/scripts/lib/enums';
import {
  TOKEN_METHOD_TRANSFER,
  TOKEN_METHOD_APPROVE,
  TOKEN_METHOD_TRANSFER_FROM,
  SEND_ETHER_ACTION_KEY,
  DEPLOY_CONTRACT_ACTION_KEY,
  APPROVE_ACTION_KEY,
  SEND_TOKEN_ACTION_KEY,
  TRANSFER_FROM_ACTION_KEY,
  SIGNATURE_REQUEST_KEY,
  DECRYPT_REQUEST_KEY,
  ENCRYPTION_PUBLIC_KEY_REQUEST_KEY,
  CONTRACT_INTERACTION_KEY,
  CANCEL_ATTEMPT_ACTION_KEY,
} from '../constants/transactions';

const decodeTokenMethod = createMethodDecoder(abi);

export function getTokenData(data = '') {
  return decodeTokenMethod(data);
}

async function getMethodFrom4Byte(fourBytePrefix) {
  const fourByteResponse = await fetchWithCache(
    `https://www.4byte.directory/api/v1/signatures/?hex_signature=${fourBytePrefix}`,
    {
      referrerPolicy: 'no-referrer-when-downgrade',
      body: null,
      method: 'GET',
      mode: 'cors',
    },
  );

  if (fourByteResponse.count === 1) {
    return fourByteResponse.results[0].text_signature;
  }
  return null;
}
let registry;

/**
 * Looks up a contract method's signature in the on-chain method registry,
 * through the user's own RPC, and only if it is not there, and the user
 * allows it, at 4byte.directory.
 *
 * @param {string} fourBytePrefix - The prefix from the method code associated with the data
 * @param {boolean} allow4ByteRequests - Whether 4byte.directory may be asked.
 * @returns {object} The method's name and params, or an empty object if it
 * could not be found
 */
export async function getMethodDataAsync(fourBytePrefix, allow4ByteRequests) {
  try {
    if (!registry) {
      registry = new MethodRegistry({ provider: global.ethereumProvider });
    }

    let sig = await registry.lookup(fourBytePrefix);

    if (!sig && allow4ByteRequests) {
      sig = await getMethodFrom4Byte(fourBytePrefix).catch((e) => {
        log.error(e);
        return null;
      });
    }

    if (!sig) {
      return {};
    }

    const parsedResult = registry.parse(sig);

    return {
      name: parsedResult.name,
      params: parsedResult.args,
    };
  } catch (error) {
    log.error(error);
    return {};
  }
}

export function isConfirmDeployContract(txData = {}) {
  const { txParams = {} } = txData;
  return !txParams.to;
}

/**
 * Given an transaction category, returns a boolean which indicates whether the transaction is calling an erc20 token method
 *
 * @param {string} transactionCategory - The category of transaction being evaluated
 * @returns {boolean} whether the transaction is calling an erc20 token method
 */
export function isTokenMethodAction(transactionCategory) {
  return [
    TOKEN_METHOD_TRANSFER,
    TOKEN_METHOD_APPROVE,
    TOKEN_METHOD_TRANSFER_FROM,
  ].includes(transactionCategory);
}

/**
 * Returns the action of a transaction as a key to be passed into the translator.
 *
 * @param {object} transaction - txData object
 * @returns {string|undefined} The translation key for the action
 */
export function getTransactionActionKey(transaction) {
  const { msgParams, type, transactionCategory } = transaction;

  if (type === 'cancel') {
    return CANCEL_ATTEMPT_ACTION_KEY;
  }

  if (msgParams) {
    if (type === MESSAGE_TYPE.ETH_DECRYPT) {
      return DECRYPT_REQUEST_KEY;
    } else if (type === MESSAGE_TYPE.ETH_GET_ENCRYPTION_PUBLIC_KEY) {
      return ENCRYPTION_PUBLIC_KEY_REQUEST_KEY;
    }
    return SIGNATURE_REQUEST_KEY;
  }

  if (isConfirmDeployContract(transaction)) {
    return DEPLOY_CONTRACT_ACTION_KEY;
  }

  const isTokenAction = isTokenMethodAction(transactionCategory);
  const isNonTokenSmartContract =
    transactionCategory === CONTRACT_INTERACTION_KEY;

  if (isTokenAction || isNonTokenSmartContract) {
    switch (transactionCategory) {
      case TOKEN_METHOD_TRANSFER:
        return SEND_TOKEN_ACTION_KEY;
      case TOKEN_METHOD_APPROVE:
        return APPROVE_ACTION_KEY;
      case TOKEN_METHOD_TRANSFER_FROM:
        return TRANSFER_FROM_ACTION_KEY;
      case CONTRACT_INTERACTION_KEY:
        return CONTRACT_INTERACTION_KEY;
      default:
        return undefined;
    }
  } else {
    return SEND_ETHER_ACTION_KEY;
  }
}

export function sumHexes(...args) {
  const total = args.reduce((acc, base) => {
    return addCurrencies(acc, base, {
      toNumericBase: 'hex',
    });
  });

  return ethUtil.addHexPrefix(total);
}

/**
 * Returns a status key for a transaction. Requires parsing the txMeta.txReceipt on top of
 * txMeta.status because txMeta.status does not reflect on-chain errors.
 *
 * @param {object} transaction - The txMeta object of a transaction.
 * @param {object} transaction.txReceipt - The transaction receipt.
 * @returns {string} 'failed', 'cancelled', or the transaction's status
 */
export function getStatusKey(transaction) {
  const {
    txReceipt: { status: receiptStatus } = {},
    type,
    status,
  } = transaction;

  // There was an on-chain failure
  if (receiptStatus === '0x0') {
    return 'failed';
  }

  if (
    status === TRANSACTION_STATUS_CONFIRMED &&
    type === TRANSACTION_TYPE_CANCEL
  ) {
    return 'cancelled';
  }

  return transaction.status;
}
