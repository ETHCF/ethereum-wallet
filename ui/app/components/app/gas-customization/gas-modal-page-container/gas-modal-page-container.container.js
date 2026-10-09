import { addHexPrefix } from '@ethereumjs/util';
import { connect } from 'react-redux';

import GasModalPageContainer from './gas-modal-page-container.component';
import {
  gasPriceForTransaction,
  editedGasParams,
  isFeeMarketTransaction,
  bumpFee,
} from '../../../../../../app/scripts/lib/transaction-fees';
import {
  setCustomGasPrice,
  setCustomGasLimit,
  resetCustomData,
  fetchBasicGasEstimates,
} from '../../../../ducks/gas/gas.duck';
import {
  hideGasButtonGroup,
  updateSendErrors,
} from '../../../../ducks/send/send.duck';
import {
  addHexWEIsToDec,
  subtractHexWEIsToDec,
  hexWEIToDecGWEI,
} from '../../../../helpers/utils/conversions.util';
import { formatETHFee } from '../../../../helpers/utils/formatters';
import { calcMaxAmount } from '../../../../pages/send/send-content/send-amount-row/amount-max-button/amount-max-button.utils';
import {
  calcGasTotal,
  isBalanceSufficient,
} from '../../../../pages/send/send.utils';
import {
  getCurrentEthBalance,
  getSendToken,
  getBasicGasEstimateLoadingStatus,
  getCustomGasLimit,
  getCustomGasPrice,
  getDefaultActiveButtonIndex,
  getRenderableBasicEstimateData,
  isCustomPriceSafe,
  getTokenBalance,
  getSendMaxModeState,
  getFastPriceEstimateInHexWEI,
} from '../../../../selectors';
import {
  hideModal,
  setGasLimit,
  setGasPrice,
  createSpeedUpTransaction,
  hideSidebar,
  updateSend,
  updateSendAmount,
  setGasTotal,
  updateTransaction,
} from '../../../../store/actions';

const mapStateToProps = (state, ownProps) => {
  const { currentNetworkTxList, send } = state.ecfWallet;
  const { modalState: { props: modalProps } = {} } = state.appState.modal || {};
  const { txData = {} } = modalProps || {};
  const { transaction = {} } = ownProps;
  const selectedTransaction = currentNetworkTxList.find(
    ({ id }) => id === (transaction.id || txData.id),
  );

  const buttonDataLoading = getBasicGasEstimateLoadingStatus(state);
  const sendToken = getSendToken(state);

  // a "default" txParams is used during the send flow, since the transaction doesn't exist yet in that case
  const txParams = selectedTransaction?.txParams
    ? selectedTransaction.txParams
    : {
        gas: send.gasLimit || '0x5208',
        gasPrice: send.gasPrice || getFastPriceEstimateInHexWEI(state, true),
        value: sendToken ? '0x0' : send.amount,
      };

  const { gas: currentGasLimit, value } = txParams;
  const currentGasPrice = gasPriceForTransaction(txParams);
  const customModalGasPriceInHex = getCustomGasPrice(state) || currentGasPrice;
  const customModalGasLimitInHex =
    getCustomGasLimit(state) || currentGasLimit || '0x5208';
  const customGasTotal = calcGasTotal(
    customModalGasLimitInHex,
    customModalGasPriceInHex,
  );

  const gasButtonInfo = getRenderableBasicEstimateData(
    state,
    customModalGasLimitInHex,
  );

  const { hideBasic } = state.appState.modal.modalState.props;

  const customGasPrice = calcCustomGasPrice(customModalGasPriceInHex);

  const maxModeOn = getSendMaxModeState(state);

  const balance = getCurrentEthBalance(state);

  const isSendTokenSet = Boolean(sendToken);

  const newTotalEth =
    maxModeOn && !isSendTokenSet
      ? addHexWEIsToRenderableEth(balance, '0x0')
      : addHexWEIsToRenderableEth(value, customGasTotal);

  const sendAmount =
    maxModeOn && !isSendTokenSet
      ? subtractHexWEIsFromRenderableEth(balance, customGasTotal)
      : addHexWEIsToRenderableEth(value, '0x0');

  const insufficientBalance = maxModeOn
    ? false
    : !isBalanceSufficient({
        amount: value,
        gasTotal: customGasTotal,
        balance,
      });

  return {
    hideBasic,
    feeMarketParams: isFeeMarketTransaction(txParams)
      ? {
          ...txParams,
          gas: customModalGasLimitInHex,
          maxFeePerGas: customModalGasPriceInHex,
          maxPriorityFeePerGas: ['submitted', 'failed'].includes(
            transaction.status,
          )
            ? bumpFee(txParams.maxPriorityFeePerGas)
            : txParams.maxPriorityFeePerGas,
        }
      : undefined,
    minimumMaxFeePerGas:
      isFeeMarketTransaction(txParams) &&
      ['submitted', 'failed'].includes(transaction.status)
        ? bumpFee(txParams.maxFeePerGas)
        : undefined,
    isConfirm: isConfirm(state),
    customModalGasPriceInHex,
    customModalGasLimitInHex,
    customGasPrice,
    customGasLimit: calcCustomGasLimit(customModalGasLimitInHex),
    customGasTotal,
    customPriceIsSafe: isCustomPriceSafe(state),
    maxModeOn,
    gasPriceButtonGroupProps: {
      buttonDataLoading,
      defaultActiveButtonIndex: getDefaultActiveButtonIndex(
        gasButtonInfo,
        customModalGasPriceInHex,
      ),
      gasButtonInfo,
    },
    infoRowProps: {
      newTotalEth,
      transactionFee: addHexWEIsToRenderableEth('0x0', customGasTotal),
      sendAmount,
    },
    transaction: txData || transaction,
    isSpeedUp: transaction.status === 'submitted',
    isRetry: transaction.status === 'failed',
    txId: transaction.id,
    insufficientBalance,
    sendToken,
    balance,
    tokenBalance: getTokenBalance(state),
  };
};

const mapDispatchToProps = (dispatch) => {
  const updateCustomGasPrice = (newPrice) =>
    dispatch(setCustomGasPrice(addHexPrefix(newPrice)));

  return {
    cancelAndClose: () => {
      dispatch(resetCustomData());
      dispatch(hideModal());
    },
    hideModal: () => dispatch(hideModal()),
    updateCustomGasPrice,
    updateCustomGasLimit: (newLimit) =>
      dispatch(setCustomGasLimit(addHexPrefix(newLimit))),
    setGasData: (newLimit, newPrice) => {
      // A limit the user chose replaces the estimate that failed.
      dispatch(updateSendErrors({ gasLoading: null }));
      dispatch(setGasLimit(newLimit));
      dispatch(setGasPrice(newPrice));
      dispatch(updateSend({ gasPriceIsCustom: true }));
    },
    updateConfirmTxGasAndCalculate: (gasLimit, gasPrice, updatedTx) => {
      updateCustomGasPrice(gasPrice);
      dispatch(setCustomGasLimit(addHexPrefix(gasLimit.toString(16))));
      return dispatch(updateTransaction(updatedTx));
    },
    createSpeedUpTransaction: (txId, gasPrice, gasLimit) => {
      return dispatch(createSpeedUpTransaction(txId, gasPrice, gasLimit));
    },
    hideGasButtonGroup: () => dispatch(hideGasButtonGroup()),
    hideSidebar: () => dispatch(hideSidebar()),
    fetchBasicGasEstimates: () => dispatch(fetchBasicGasEstimates()),
    setGasTotal: (total) => dispatch(setGasTotal(total)),
    setAmountToMax: (maxAmountDataObject) => {
      dispatch(updateSendErrors({ amount: null }));
      dispatch(updateSendAmount(calcMaxAmount(maxAmountDataObject)));
    },
  };
};

const mergeProps = (stateProps, dispatchProps, ownProps) => {
  const {
    gasPriceButtonGroupProps,

    isConfirm,
    txId,
    isSpeedUp,
    isRetry,
    insufficientBalance,
    maxModeOn,
    customGasPrice,
    customGasTotal,
    balance,
    sendToken,
    tokenBalance,
    customGasLimit,
    transaction,
  } = stateProps;
  const {
    hideGasButtonGroup: dispatchHideGasButtonGroup,
    setGasData: dispatchSetGasData,
    updateConfirmTxGasAndCalculate: dispatchUpdateConfirmTxGasAndCalculate,
    createSpeedUpTransaction: dispatchCreateSpeedUpTransaction,
    hideSidebar: dispatchHideSidebar,
    cancelAndClose: dispatchCancelAndClose,
    hideModal: dispatchHideModal,
    setAmountToMax: dispatchSetAmountToMax,
    ...otherDispatchProps
  } = dispatchProps;

  return {
    ...stateProps,
    ...otherDispatchProps,
    ...ownProps,
    onSubmit: (gasLimit, gasPrice) => {
      if (isConfirm) {
        const updatedTx = {
          ...transaction,
          txParams: editedGasParams(transaction.txParams, {
            gasLimit,
            gasPrice,
          }),
        };
        dispatchUpdateConfirmTxGasAndCalculate(gasLimit, gasPrice, updatedTx);
        dispatchHideModal();
      } else if (isSpeedUp || isRetry) {
        // A failed transaction is retried the same way a pending one is sped
        // up: by a replacement with the same nonce and a higher gas price.
        dispatchCreateSpeedUpTransaction(txId, gasPrice, gasLimit);
        dispatchHideSidebar();
        dispatchCancelAndClose();
      } else {
        dispatchSetGasData(gasLimit, gasPrice);
        dispatchHideGasButtonGroup();
        dispatchCancelAndClose();
      }
      if (maxModeOn) {
        dispatchSetAmountToMax({
          balance,
          gasTotal: customGasTotal,
          sendToken,
          tokenBalance,
        });
      }
    },
    gasPriceButtonGroupProps: {
      ...gasPriceButtonGroupProps,
      handleGasPriceSelection: otherDispatchProps.updateCustomGasPrice,
    },
    cancelAndClose: () => {
      dispatchCancelAndClose();
      if (isSpeedUp || isRetry) {
        dispatchHideSidebar();
      }
    },
    disableSave:
      insufficientBalance ||
      (isSpeedUp && customGasPrice === 0) ||
      customGasLimit < 21000,
  };
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
)(GasModalPageContainer);

function isConfirm(state) {
  return Boolean(Object.keys(state.confirmTransaction.txData).length);
}

function calcCustomGasPrice(customGasPriceInHex) {
  return Number(hexWEIToDecGWEI(customGasPriceInHex));
}

function calcCustomGasLimit(customGasLimitInHex) {
  return parseInt(customGasLimitInHex, 16);
}

function addHexWEIsToRenderableEth(aHexWEI, bHexWEI) {
  return formatETHFee(addHexWEIsToDec(aHexWEI, bHexWEI));
}

function subtractHexWEIsFromRenderableEth(aHexWEI, bHexWEI) {
  return formatETHFee(subtractHexWEIsToDec(aHexWEI, bHexWEI));
}
