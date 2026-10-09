import { createSelector } from 'reselect';

import { getNativeCurrency } from '.';
import {
  networkSelector,
  unapprovedDecryptMsgsSelector,
  unapprovedEncryptionPublicKeyMsgsSelector,
  unapprovedPersonalMsgsSelector,
  unapprovedTxsSelector,
  unapprovedTypedMessagesSelector,
} from './transactions';
import { gasPriceForTransaction } from '../../../app/scripts/lib/transaction-fees';
import txHelper from '../../lib/tx-helper';
import {
  roundExponential,
  getValueFromWeiHex,
  getHexGasTotal,
  getTransactionFee,
  addEth,
} from '../helpers/utils/confirm-tx.util';
import { calcTokenAmount } from '../helpers/utils/token-util';
import { sumHexes } from '../helpers/utils/transactions.util';

export const unconfirmedTransactionsListSelector = createSelector(
  unapprovedTxsSelector,
  unapprovedPersonalMsgsSelector,
  unapprovedDecryptMsgsSelector,
  unapprovedEncryptionPublicKeyMsgsSelector,
  unapprovedTypedMessagesSelector,
  networkSelector,
  (
    unapprovedTxs = {},
    unapprovedPersonalMsgs = {},
    unapprovedDecryptMsgs = {},
    unapprovedEncryptionPublicKeyMsgs = {},
    unapprovedTypedMessages = {},
    network,
  ) =>
    txHelper(
      unapprovedTxs,
      unapprovedPersonalMsgs,
      unapprovedDecryptMsgs,
      unapprovedEncryptionPublicKeyMsgs,
      unapprovedTypedMessages,
      network,
    ),
);

export const unconfirmedTransactionsHashSelector = createSelector(
  unapprovedTxsSelector,
  unapprovedPersonalMsgsSelector,
  unapprovedDecryptMsgsSelector,
  unapprovedEncryptionPublicKeyMsgsSelector,
  unapprovedTypedMessagesSelector,
  networkSelector,
  (
    unapprovedTxs = {},
    unapprovedPersonalMsgs = {},
    unapprovedDecryptMsgs = {},
    unapprovedEncryptionPublicKeyMsgs = {},
    unapprovedTypedMessages = {},
    network,
  ) => {
    const filteredUnapprovedTxs = Object.keys(unapprovedTxs).reduce(
      (acc, address) => {
        const { ecfWalletNetworkId } = unapprovedTxs[address];
        const transactions = { ...acc };

        if (ecfWalletNetworkId === network) {
          transactions[address] = unapprovedTxs[address];
        }

        return transactions;
      },
      {},
    );

    return {
      ...filteredUnapprovedTxs,
      ...unapprovedPersonalMsgs,
      ...unapprovedDecryptMsgs,
      ...unapprovedEncryptionPublicKeyMsgs,
      ...unapprovedTypedMessages,
    };
  },
);

const unapprovedPersonalMsgCountSelector = (state) =>
  state.ecfWallet.unapprovedPersonalMsgCount;
const unapprovedDecryptMsgCountSelector = (state) =>
  state.ecfWallet.unapprovedDecryptMsgCount;
const unapprovedEncryptionPublicKeyMsgCountSelector = (state) =>
  state.ecfWallet.unapprovedEncryptionPublicKeyMsgCount;
const unapprovedTypedMessagesCountSelector = (state) =>
  state.ecfWallet.unapprovedTypedMessagesCount;

export const unconfirmedTransactionsCountSelector = createSelector(
  unapprovedTxsSelector,
  unapprovedPersonalMsgCountSelector,
  unapprovedDecryptMsgCountSelector,
  unapprovedEncryptionPublicKeyMsgCountSelector,
  unapprovedTypedMessagesCountSelector,
  networkSelector,
  (
    unapprovedTxs = {},
    unapprovedPersonalMsgCount = 0,
    unapprovedDecryptMsgCount = 0,
    unapprovedEncryptionPublicKeyMsgCount = 0,
    unapprovedTypedMessagesCount = 0,
    network,
  ) => {
    const filteredUnapprovedTxIds = Object.keys(unapprovedTxs).filter(
      (txId) => {
        const { ecfWalletNetworkId } = unapprovedTxs[txId];
        return ecfWalletNetworkId === network;
      },
    );

    return (
      filteredUnapprovedTxIds.length +
      unapprovedTypedMessagesCount +
      unapprovedPersonalMsgCount +
      unapprovedDecryptMsgCount +
      unapprovedEncryptionPublicKeyMsgCount
    );
  },
);

export const txDataSelector = (state) => state.confirmTransaction.txData;
const tokenDataSelector = (state) => state.confirmTransaction.tokenData;
const tokenPropsSelector = (state) => state.confirmTransaction.tokenProps;

const tokenDecimalsSelector = createSelector(
  tokenPropsSelector,
  (tokenProps) => tokenProps && tokenProps.tokenDecimals,
);

const tokenDataParamsSelector = createSelector(
  tokenDataSelector,
  (tokenData) => (tokenData && tokenData.params) || [],
);

const TOKEN_PARAM_TO = '_to';
const TOKEN_PARAM_VALUE = '_value';

export const sendTokenTokenAmountAndToAddressSelector = createSelector(
  tokenDataParamsSelector,
  tokenDecimalsSelector,
  (params, tokenDecimals) => {
    let toAddress = '';
    let tokenAmount = 0;

    if (params && params.length) {
      toAddress = params.find((param) => param.name === TOKEN_PARAM_TO).value;
      let value = Number(
        params.find((param) => param.name === TOKEN_PARAM_VALUE).value,
      );

      if (tokenDecimals) {
        value = calcTokenAmount(value, tokenDecimals).toNumber();
      }

      tokenAmount = roundExponential(value);
    }

    return {
      toAddress,
      tokenAmount,
    };
  },
);

export const transactionFeeSelector = function (state, txData) {
  const nativeCurrency = getNativeCurrency(state);

  const { txParams: { value = '0x0', gas: gasLimit = '0x0' } = {} } = txData;
  const gasPrice = gasPriceForTransaction(txData.txParams);

  const ethTransactionAmount = getValueFromWeiHex({
    value,
    fromCurrency: nativeCurrency,
    toCurrency: nativeCurrency,
    numberOfDecimals: 6,
  });

  const hexTransactionFee = getHexGasTotal({ gasLimit, gasPrice });

  const ethTransactionFee = getTransactionFee({
    value: hexTransactionFee,
    fromCurrency: nativeCurrency,
    toCurrency: nativeCurrency,
    numberOfDecimals: 6,
  });

  const ethTransactionTotal = addEth(ethTransactionFee, ethTransactionAmount);
  const hexTransactionTotal = sumHexes(value, hexTransactionFee);

  return {
    hexTransactionAmount: value,
    ethTransactionAmount,
    hexTransactionFee,
    ethTransactionFee,
    ethTransactionTotal,
    hexTransactionTotal,
  };
};
