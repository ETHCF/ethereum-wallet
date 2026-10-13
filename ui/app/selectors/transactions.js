import { createSelector } from 'reselect';

import { getSelectedAddress } from './selectors';
import {
  TRANSACTION_TYPE_CANCEL,
  TRANSACTION_TYPE_RETRY,
} from '../../../app/scripts/controllers/transactions/enums';
import txHelper from '../../lib/tx-helper';
import {
  CONFIRMED_STATUS,
  PRIORITY_STATUS_HASH,
  PENDING_STATUS_HASH,
} from '../helpers/constants/transactions';
import { hexToDecimal } from '../helpers/utils/conversions.util';

export const unapprovedTxsSelector = (state) => state.ecfWallet.unapprovedTxs;
export const currentNetworkTxListSelector = (state) =>
  state.ecfWallet.currentNetworkTxList;
export const unapprovedPersonalMsgsSelector = (state) =>
  state.ecfWallet.unapprovedPersonalMsgs;
export const unapprovedDecryptMsgsSelector = (state) =>
  state.ecfWallet.unapprovedDecryptMsgs;
export const unapprovedEncryptionPublicKeyMsgsSelector = (state) =>
  state.ecfWallet.unapprovedEncryptionPublicKeyMsgs;
export const unapprovedTypedMessagesSelector = (state) =>
  state.ecfWallet.unapprovedTypedMessages;
export const networkSelector = (state) => state.ecfWallet.network;

export const selectedAddressTxListSelector = createSelector(
  getSelectedAddress,
  currentNetworkTxListSelector,
  (selectedAddress, transactions = []) => {
    return transactions.filter(
      ({ txParams }) => txParams.from === selectedAddress,
    );
  },
);

export const unapprovedMessagesSelector = createSelector(
  unapprovedPersonalMsgsSelector,
  unapprovedDecryptMsgsSelector,
  unapprovedEncryptionPublicKeyMsgsSelector,
  unapprovedTypedMessagesSelector,
  networkSelector,
  (
    unapprovedPersonalMsgs = {},
    unapprovedDecryptMsgs = {},
    unapprovedEncryptionPublicKeyMsgs = {},
    unapprovedTypedMessages = {},
    network,
  ) =>
    txHelper(
      {},
      unapprovedPersonalMsgs,
      unapprovedDecryptMsgs,
      unapprovedEncryptionPublicKeyMsgs,
      unapprovedTypedMessages,
      network,
    ),
);

export const transactionsSelector = createSelector(
  unapprovedMessagesSelector,
  selectedAddressTxListSelector,
  (unapprovedMessages = [], selectedAddressTxList = []) => {
    const txsToRender = selectedAddressTxList.concat(unapprovedMessages);

    return txsToRender.sort((a, b) => b.time - a.time);
  },
);

/**
 * Inserts (mutates) a nonce into an array of ordered nonces, sorted in ascending
 * order.
 *
 * @name insertOrderedNonce
 * @private
 * @param {string[]} nonces - Array of nonce strings in hex
 * @param {string} nonceToInsert - Nonce string in hex to be inserted into the array of nonces.
 */
const insertOrderedNonce = (nonces, nonceToInsert) => {
  let insertIndex = nonces.length;

  for (let i = 0; i < nonces.length; i++) {
    const nonce = nonces[i];

    if (Number(hexToDecimal(nonce)) > Number(hexToDecimal(nonceToInsert))) {
      insertIndex = i;
      break;
    }
  }

  nonces.splice(insertIndex, 0, nonceToInsert);
};

/**
 * Inserts (mutates) a transaction object into an array of ordered transactions, sorted
 * in ascending order by time.
 *
 * @name insertTransactionByTime
 * @private
 * @param {object[]} transactions - Array of transaction objects.
 * @param {object} transaction - Transaction object to be inserted into the array of transactions.
 */
const insertTransactionByTime = (transactions, transaction) => {
  const { time } = transaction;

  let insertIndex = transactions.length;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    if (tx.time > time) {
      insertIndex = i;
      break;
    }
  }

  transactions.splice(insertIndex, 0, transaction);
};

/**
 * Contains transactions and properties associated with those transactions of the same nonce.
 *
 * @typedef {object} transactionGroup
 * @property {string} nonce - The nonce that the transactions within this transactionGroup share.
 * @property {object[]} transactions - An array of transaction (txMeta) objects.
 * @property {object} initialTransaction - The transaction (txMeta) with the lowest "time".
 * @property {object} primaryTransaction - Either the latest transaction or the confirmed
 * transaction.
 * @property {boolean} hasRetried - True if a transaction in the group was a retry transaction.
 * @property {boolean} hasCancelled - True if a transaction in the group was a cancel transaction.
 */

/**
 * Inserts (mutates) a transactionGroup object into an array of ordered
 * transactionGroups, sorted in ascending order by the time of each group's
 * primary transaction.
 *
 * @name insertTransactionGroupByTime
 * @private
 * @param {transactionGroup[]} transactionGroups - Array of transactionGroup objects.
 * @param {transactionGroup} transactionGroup - transactionGroup object to be inserted into the
 * array of transactionGroups.
 */
const insertTransactionGroupByTime = (transactionGroups, transactionGroup) => {
  const { primaryTransaction: { time: groupToInsertTime } = {} } =
    transactionGroup;

  let insertIndex = transactionGroups.length;

  for (let i = 0; i < transactionGroups.length; i++) {
    const txGroup = transactionGroups[i];
    const { primaryTransaction: { time } = {} } = txGroup;

    if (time > groupToInsertTime) {
      insertIndex = i;
      break;
    }
  }

  transactionGroups.splice(insertIndex, 0, transactionGroup);
};

/**
 * @name nonceSortedTransactionsSelector
 * @description Returns an array of transactionGroups sorted by nonce in ascending order.
 * @returns {transactionGroup[]}
 */
export const nonceSortedTransactionsSelector = createSelector(
  transactionsSelector,
  (transactions = []) => {
    const unapprovedTransactionGroups = [];
    const orderedNonces = [];
    const nonceToTransactionsMap = {};

    transactions.forEach((transaction) => {
      const {
        txParams: { nonce } = {},
        status,
        type,
        time: txTime,
      } = transaction;

      if (typeof nonce === 'undefined') {
        insertTransactionGroupByTime(unapprovedTransactionGroups, {
          transactions: [transaction],
          initialTransaction: transaction,
          primaryTransaction: transaction,
          hasRetried: false,
          hasCancelled: false,
        });
      } else if (Reflect.has(nonceToTransactionsMap, nonce)) {
        const nonceProps = nonceToTransactionsMap[nonce];
        insertTransactionByTime(nonceProps.transactions, transaction);

        if (Reflect.has(PRIORITY_STATUS_HASH, status)) {
          const { primaryTransaction: { time: primaryTxTime = 0 } = {} } =
            nonceProps;

          if (status === CONFIRMED_STATUS || txTime > primaryTxTime) {
            nonceProps.primaryTransaction = transaction;
          }
        }

        const { initialTransaction: { time: initialTxTime = 0 } = {} } =
          nonceProps;

        // Used to display the transaction action, since we don't want to overwrite the action if
        // it was replaced with a cancel attempt transaction.
        if (txTime < initialTxTime) {
          nonceProps.initialTransaction = transaction;
        }

        if (type === TRANSACTION_TYPE_RETRY) {
          nonceProps.hasRetried = true;
        }

        if (type === TRANSACTION_TYPE_CANCEL) {
          nonceProps.hasCancelled = true;
        }
      } else {
        nonceToTransactionsMap[nonce] = {
          nonce,
          transactions: [transaction],
          initialTransaction: transaction,
          primaryTransaction: transaction,
          hasRetried: transaction.type === TRANSACTION_TYPE_RETRY,
          hasCancelled: transaction.type === TRANSACTION_TYPE_CANCEL,
        };

        insertOrderedNonce(orderedNonces, nonce);
      }
    });

    const orderedTransactionGroups = orderedNonces.map(
      (nonce) => nonceToTransactionsMap[nonce],
    );
    return unapprovedTransactionGroups.concat(orderedTransactionGroups);
  },
);

/**
 * @name nonceSortedPendingTransactionsSelector
 * @description Returns an array of transactionGroups where transactions are still pending sorted by
 * nonce in descending order.
 * @returns {transactionGroup[]}
 */
export const nonceSortedPendingTransactionsSelector = createSelector(
  nonceSortedTransactionsSelector,
  (transactions = []) =>
    transactions.filter(({ primaryTransaction }) =>
      Reflect.has(PENDING_STATUS_HASH, primaryTransaction.status),
    ),
);

/**
 * @name nonceSortedCompletedTransactionsSelector
 * @description Returns an array of transactionGroups where transactions are confirmed sorted by
 * nonce in descending order.
 * @returns {transactionGroup[]}
 */
export const nonceSortedCompletedTransactionsSelector = createSelector(
  nonceSortedTransactionsSelector,
  (transactions = []) =>
    transactions
      .filter(
        ({ primaryTransaction }) =>
          !Reflect.has(PENDING_STATUS_HASH, primaryTransaction.status),
      )
      .reverse(),
);
