import contractMap from '@metamask/contract-metadata';
import { connect } from 'react-redux';
import { compose } from 'redux';

import ConfirmTransactionBase from './confirm-transaction-base.component';
import {
  gasPriceForTransaction,
  editedGasParams,
} from '../../../../app/scripts/lib/transaction-fees';
import { clearConfirmTransaction } from '../../ducks/confirm-transaction/confirm-transaction.duck';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import {
  INSUFFICIENT_FUNDS_ERROR_KEY,
  GAS_LIMIT_TOO_LOW_ERROR_KEY,
} from '../../helpers/constants/error-keys';
import withRouter from '../../helpers/higher-order-components/with-router';
import { getHexGasTotal } from '../../helpers/utils/confirm-tx.util';
import { conversionGreaterThan } from '../../helpers/utils/conversion-util';
import { checksumAddress, valuesFor } from '../../helpers/utils/util';
import {
  getCustomNonceValue,
  getIsMainnet,
  getKnownMethodData,
  getEcfWalletAccounts,
  getUseNonceField,
  transactionFeeSelector,
} from '../../selectors';
import {
  updateCustomNonce,
  cancelTx,
  cancelTxs,
  updateAndApproveTx,
  showModal,
  updateTransaction,
  getNextNonce,
  tryReverseResolveAddress,
} from '../../store/actions';
import { MIN_GAS_LIMIT_DEC } from '../send/send.constants';
import { isBalanceSufficient, calcGasTotal } from '../send/send.utils';

const casedContractMap = Object.keys(contractMap).reduce((acc, base) => {
  return {
    ...acc,
    [base.toLowerCase()]: contractMap[base],
  };
}, {});

let customNonceValue = '';
const customNonceMerge = (txData) =>
  customNonceValue
    ? {
        ...txData,
        customNonceValue,
      }
    : txData;

const mapStateToProps = (state, ownProps) => {
  const {
    toAddress: propsToAddress,
    customTxParamsData,
    params = {},
  } = ownProps;
  const { id: paramsTransactionId } = params;
  const isMainnet = getIsMainnet(state);
  const { confirmTransaction, ecfWallet } = state;
  const {
    ensResolutionsByAddress,
    identities,
    addressBook,
    assetImages,
    network,
    unapprovedTxs,
    nextNonce,
  } = ecfWallet;
  const { tokenData, txData, tokenProps, nonce } = confirmTransaction;
  const {
    txParams = {},
    lastGasPrice,
    id: transactionId,
    transactionCategory,
  } = txData;
  const transaction =
    Object.values(unapprovedTxs).find(
      ({ id }) => id === (transactionId || Number(paramsTransactionId)),
    ) || {};
  const {
    from: fromAddress,
    to: txParamsToAddress,
    gas: gasLimit,
    value: amount,
    data,
  } = (transaction && transaction.txParams) || txParams;
  const gasPrice = gasPriceForTransaction(transaction.txParams || txParams);
  const accounts = getEcfWalletAccounts(state);
  const assetImage = assetImages[txParamsToAddress];

  const { balance } = accounts[fromAddress];
  const { name: fromName } = identities[fromAddress];
  const toAddress = propsToAddress || txParamsToAddress;

  const toName =
    identities[toAddress]?.name ||
    casedContractMap[toAddress]?.name ||
    checksumAddress(toAddress);

  const checksummedAddress = checksumAddress(toAddress);
  const addressBookObject = addressBook[checksummedAddress];
  const toEns = ensResolutionsByAddress[checksummedAddress] || '';
  const toNickname = addressBookObject ? addressBookObject.name : '';
  const isTxReprice = Boolean(lastGasPrice);
  const transactionStatus = transaction ? transaction.status : '';

  const { hexTransactionAmount, hexTransactionFee, hexTransactionTotal } =
    transactionFeeSelector(state, transaction);

  if (transaction && transaction.simulationFails) {
    txData.simulationFails = transaction.simulationFails;
  }

  const currentNetworkUnapprovedTxs = Object.keys(unapprovedTxs)
    .filter((key) => unapprovedTxs[key].ecfWalletNetworkId === network)
    .reduce((acc, key) => ({ ...acc, [key]: unapprovedTxs[key] }), {});
  const unapprovedTxCount = valuesFor(currentNetworkUnapprovedTxs).length;

  const insufficientBalance = !isBalanceSufficient({
    amount,
    gasTotal: calcGasTotal(gasLimit, gasPrice),
    balance,
  });

  const methodData = getKnownMethodData(state, data) || {};

  let fullTxData = { ...txData, ...transaction };
  if (customTxParamsData) {
    fullTxData = {
      ...fullTxData,
      txParams: {
        ...fullTxData.txParams,
        data: customTxParamsData,
      },
    };
  }

  return {
    balance,
    fromAddress,
    fromName,
    toAddress,
    toEns,
    toName,
    toNickname,
    hexTransactionAmount,
    hexTransactionFee,
    hexTransactionTotal,
    txData: fullTxData,
    tokenData,
    methodData,
    tokenProps,
    isTxReprice,
    transactionStatus,
    nonce,
    assetImage,
    unapprovedTxs,
    unapprovedTxCount,
    currentNetworkUnapprovedTxs,
    customGas: {
      gasLimit,
      gasPrice,
    },
    useNonceField: getUseNonceField(state),
    customNonceValue: getCustomNonceValue(state),
    insufficientBalance,
    transactionCategory,
    nextNonce,
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    isMainnet,
  };
};

export const mapDispatchToProps = (dispatch) => {
  return {
    tryReverseResolveAddress: (address) => {
      return dispatch(tryReverseResolveAddress(address));
    },
    updateCustomNonce: (value) => {
      customNonceValue = value;
      dispatch(updateCustomNonce(value));
    },
    clearConfirmTransaction: () => dispatch(clearConfirmTransaction()),
    showTransactionConfirmedModal: ({ onSubmit }) => {
      return dispatch(showModal({ name: 'TRANSACTION_CONFIRMED', onSubmit }));
    },
    showCustomizeGasModal: ({ txData, onSubmit, validate }) => {
      return dispatch(
        showModal({ name: 'CUSTOMIZE_GAS', txData, onSubmit, validate }),
      );
    },
    updateGasAndCalculate: (updatedTx) => {
      return dispatch(updateTransaction(updatedTx));
    },
    showRejectTransactionsConfirmationModal: ({
      onSubmit,
      unapprovedTxCount,
    }) => {
      return dispatch(
        showModal({ name: 'REJECT_TRANSACTIONS', onSubmit, unapprovedTxCount }),
      );
    },
    cancelTransaction: ({ id }) => dispatch(cancelTx({ id })),
    cancelAllTransactions: (txList) => dispatch(cancelTxs(txList)),
    sendTransaction: (txData) =>
      dispatch(updateAndApproveTx(customNonceMerge(txData))),
    getNextNonce: () => dispatch(getNextNonce()),
  };
};

const getValidateEditGas = ({ balance, txData }) => {
  const { txParams: { value: amount } = {} } = txData;

  return ({ gasLimit, gasPrice }) => {
    const gasTotal = getHexGasTotal({ gasLimit, gasPrice });
    const hasSufficientBalance = isBalanceSufficient({
      amount,
      gasTotal,
      balance,
    });

    if (!hasSufficientBalance) {
      return {
        valid: false,
        errorKey: INSUFFICIENT_FUNDS_ERROR_KEY,
      };
    }

    const gasLimitTooLow =
      gasLimit &&
      conversionGreaterThan(
        {
          value: MIN_GAS_LIMIT_DEC,
          fromNumericBase: 'dec',
        },
        {
          value: gasLimit,
          fromNumericBase: 'hex',
        },
      );

    if (gasLimitTooLow) {
      return {
        valid: false,
        errorKey: GAS_LIMIT_TOO_LOW_ERROR_KEY,
      };
    }

    return {
      valid: true,
    };
  };
};

const mergeProps = (stateProps, dispatchProps, ownProps) => {
  const { balance, txData, unapprovedTxs } = stateProps;
  const {
    cancelAllTransactions: dispatchCancelAllTransactions,
    showCustomizeGasModal: dispatchShowCustomizeGasModal,
    updateGasAndCalculate: dispatchUpdateGasAndCalculate,
    ...otherDispatchProps
  } = dispatchProps;

  const validateEditGas = getValidateEditGas({ balance, txData });

  return {
    ...stateProps,
    ...otherDispatchProps,
    ...ownProps,
    showCustomizeGasModal: () =>
      dispatchShowCustomizeGasModal({
        txData,
        onSubmit: (customGas) => dispatchUpdateGasAndCalculate(customGas),
        validate: validateEditGas,
      }),
    cancelAllTransactions: () =>
      dispatchCancelAllTransactions(valuesFor(unapprovedTxs)),
    updateGasAndCalculate: (fees) => {
      const updatedTx = {
        ...txData,
        txParams: editedGasParams(txData.txParams, fees),
      };
      return dispatchUpdateGasAndCalculate(updatedTx);
    },
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps, mergeProps),
)(ConfirmTransactionBase);
