import * as ethUtil from '@ethereumjs/util';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import FeeMarketInputs from './fee-market-inputs';
import { ENVIRONMENT_TYPE_NOTIFICATION } from '../../../../app/scripts/lib/enums';
import { isFeeMarketTransaction } from '../../../../app/scripts/lib/transaction-fees';
import { getEnvironmentType } from '../../../../app/scripts/lib/util';
import ConfirmPageContainer, {
  ConfirmDetailRow,
} from '../../components/app/confirm-page-container';
import AdvancedGasInputs from '../../components/app/gas-customization/advanced-gas-inputs';
import SecurityAlerts, {
  getAlertAcknowledgement,
} from '../../components/app/security-alerts';
import TransactionSimulation from '../../components/app/transaction-simulation';
import UserPreferencedCurrencyDisplay from '../../components/app/user-preferenced-currency-display';
import {
  INSUFFICIENT_FUNDS_ERROR_KEY,
  TRANSACTION_ERROR_KEY,
  GAS_LIMIT_TOO_LOW_ERROR_KEY,
} from '../../helpers/constants/error-keys';
import { CONFIRM_TRANSACTION_ROUTE } from '../../helpers/constants/routes';
import {
  CONFIRMED_STATUS,
  DROPPED_STATUS,
} from '../../helpers/constants/transactions';
import { hexToDecimal } from '../../helpers/utils/conversions.util';
import { isBalanceSufficient } from '../send/send.utils';

export default class ConfirmTransactionBase extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    // react-router props
    navigate: PropTypes.func,
    // Redux props
    balance: PropTypes.string,
    cancelTransaction: PropTypes.func,
    cancelAllTransactions: PropTypes.func,
    clearConfirmTransaction: PropTypes.func,
    fromAddress: PropTypes.string,
    fromName: PropTypes.string,
    hexTransactionAmount: PropTypes.string,
    hexTransactionFee: PropTypes.string,
    hexTransactionTotal: PropTypes.string,
    isTxReprice: PropTypes.bool,
    methodData: PropTypes.object,
    nonce: PropTypes.string,
    assetImage: PropTypes.string,
    sendTransaction: PropTypes.func,
    showCustomizeGasModal: PropTypes.func,
    showTransactionConfirmedModal: PropTypes.func,
    showRejectTransactionsConfirmationModal: PropTypes.func,
    toAddress: PropTypes.string,
    tokenData: PropTypes.object,
    tokenProps: PropTypes.object,
    toName: PropTypes.string,
    toEns: PropTypes.string,
    toNickname: PropTypes.string,
    transactionStatus: PropTypes.string,
    txData: PropTypes.object,
    unapprovedTxCount: PropTypes.number,
    currentNetworkUnapprovedTxs: PropTypes.object,
    updateGasAndCalculate: PropTypes.func,
    customGas: PropTypes.object,
    // Component props
    contentComponent: PropTypes.node,
    dataComponent: PropTypes.node,
    detailsComponent: PropTypes.node,
    errorKey: PropTypes.string,
    errorMessage: PropTypes.string,
    primaryTotalTextOverride: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.node,
    ]),
    hideData: PropTypes.bool,
    identiconAddress: PropTypes.string,
    onCancel: PropTypes.func,
    onEdit: PropTypes.func,
    onEditGas: PropTypes.func,
    onSubmit: PropTypes.func,
    summaryComponent: PropTypes.node,
    title: PropTypes.string,
    titleComponent: PropTypes.node,
    valid: PropTypes.bool,
    warning: PropTypes.string,
    insufficientBalance: PropTypes.bool,
    transactionCategory: PropTypes.string,
    tryReverseResolveAddress: PropTypes.func.isRequired,
    hideSenderToRecipient: PropTypes.bool,
    showAccountInHeader: PropTypes.bool,
    mostRecentOverviewPage: PropTypes.string.isRequired,
    isMainnet: PropTypes.bool,
    nativeCurrency: PropTypes.string,
    trackedTokens: PropTypes.array,
    simulationStale: PropTypes.bool,
  };

  state = {
    submitting: false,
    submitError: null,
    alertsAcknowledged: false,
  };

  alertAcknowledgement() {
    return getAlertAcknowledgement(
      this.props.txData?.securityAlerts,
      this.state.alertsAcknowledged,
      (alertsAcknowledged) => this.setState({ alertsAcknowledged }),
    );
  }

  componentDidUpdate(prevProps) {
    if (this.props.txData?.id !== prevProps.txData?.id) {
      this.setState({ feeInputInvalid: false, alertsAcknowledged: false });
    }
    const {
      transactionStatus,
      showTransactionConfirmedModal,
      navigate,
      clearConfirmTransaction,
      mostRecentOverviewPage,
      toAddress,
      tryReverseResolveAddress,
    } = this.props;
    const { toAddress: prevToAddress, transactionStatus: prevTxStatus } =
      prevProps;
    const statusUpdated = transactionStatus !== prevTxStatus;
    const txDroppedOrConfirmed =
      transactionStatus === DROPPED_STATUS ||
      transactionStatus === CONFIRMED_STATUS;

    if (statusUpdated && txDroppedOrConfirmed) {
      showTransactionConfirmedModal({
        onSubmit: () => {
          clearConfirmTransaction();
          navigate(mostRecentOverviewPage);
        },
      });
    }

    if (toAddress && toAddress !== prevToAddress) {
      tryReverseResolveAddress(toAddress);
    }
  }

  getErrorKey() {
    if (this.state.feeInputInvalid) {
      return { valid: false };
    }
    const {
      balance,
      hexTransactionFee,
      txData: { simulationFails, txParams: { value: amount } = {} } = {},
      customGas,
    } = this.props;

    const insufficientBalance =
      balance &&
      !isBalanceSufficient({
        amount,
        gasTotal: hexTransactionFee || '0x0',
        balance,
      });

    if (insufficientBalance) {
      return {
        valid: false,
        errorKey: INSUFFICIENT_FUNDS_ERROR_KEY,
      };
    }

    if (hexToDecimal(customGas.gasLimit) < 21000) {
      return {
        valid: false,
        errorKey: GAS_LIMIT_TOO_LOW_ERROR_KEY,
      };
    }

    if (simulationFails) {
      return {
        valid: true,
        errorKey: simulationFails.errorKey
          ? simulationFails.errorKey
          : TRANSACTION_ERROR_KEY,
      };
    }

    return {
      valid: true,
    };
  }

  handleEditGas() {
    const { onEditGas, showCustomizeGasModal } = this.props;

    if (onEditGas) {
      onEditGas();
    } else {
      showCustomizeGasModal();
    }
  }

  renderDetails() {
    const {
      detailsComponent,
      primaryTotalTextOverride,
      hexTransactionFee,
      hexTransactionTotal,
      customGas,
      insufficientBalance,
      updateGasAndCalculate,
      isMainnet,
    } = this.props;

    const txParams = this.props.txData?.txParams || {};
    const feeMarket = isFeeMarketTransaction(txParams);
    const notMainnetOrTest = !(isMainnet || process.env.IN_TEST);

    return (
      detailsComponent || (
        <div className="confirm-page-container-content__details">
          <div className="confirm-page-container-content__gas-fee">
            <ConfirmDetailRow
              label={feeMarket ? 'Maximum gas fee' : 'Gas Fee'}
              value={hexTransactionFee}
              headerText={notMainnetOrTest || feeMarket ? '' : 'Edit'}
              headerTextClassName={
                notMainnetOrTest ? '' : 'confirm-detail-row__header-text--edit'
              }
              onHeaderClick={
                notMainnetOrTest || feeMarket
                  ? null
                  : () => this.handleEditGas()
              }
            />
            {feeMarket && (
              <FeeMarketInputs
                key={this.props.txData.id}
                params={txParams}
                onChange={updateGasAndCalculate}
                onValidityChange={(valid) =>
                  this.setState({ feeInputInvalid: !valid })
                }
              />
            )}
            {txParams.authorizationList && (
              <div role="alert">
                <strong>Account delegation (EIP-7702)</strong>
                <p>
                  These authorizations allow the listed contracts to execute on
                  behalf of the signing accounts. Delegations persist after this
                  transaction.
                </p>
                {txParams.authorizationList.map((entry, index) => (
                  <p key={index}>
                    Contract: {entry.address}; chain: {entry.chainId}; nonce:{' '}
                    {entry.nonce}
                  </p>
                ))}
              </div>
            )}
            {!feeMarket && notMainnetOrTest ? (
              <AdvancedGasInputs
                updateCustomGasPrice={(newGasPrice) =>
                  updateGasAndCalculate({ ...customGas, gasPrice: newGasPrice })
                }
                updateCustomGasLimit={(newGasLimit) =>
                  updateGasAndCalculate({ ...customGas, gasLimit: newGasLimit })
                }
                customGasPrice={customGas.gasPrice}
                customGasLimit={customGas.gasLimit}
                insufficientBalance={insufficientBalance}
                customPriceIsSafe
                isSpeedUp={false}
              />
            ) : null}
          </div>
          <div>
            <ConfirmDetailRow
              label="Total"
              value={hexTransactionTotal}
              primaryText={primaryTotalTextOverride}
              headerText="Amount + Gas Fee"
              headerTextClassName="confirm-detail-row__header-text--total"
              primaryValueTextColor="#2f9ae0"
            />
          </div>
        </div>
      )
    );
  }

  renderData(functionType) {
    const { t } = this.context;
    const {
      txData: { txParams: { data } = {} } = {},
      methodData: { params } = {},
      hideData,
      dataComponent,
    } = this.props;

    if (hideData) {
      return null;
    }

    return (
      dataComponent || (
        <div className="confirm-page-container-content__data">
          <div className="confirm-page-container-content__data-box-label">
            {`${t('functionType')}:`}
            <span className="confirm-page-container-content__function-type">
              {functionType}
            </span>
          </div>
          {params && (
            <div className="confirm-page-container-content__data-box">
              <div className="confirm-page-container-content__data-field-label">
                {`${t('parameters')}:`}
              </div>
              <div>
                <pre>{JSON.stringify(params, null, 2)}</pre>
              </div>
            </div>
          )}
          <div className="confirm-page-container-content__data-box-label">
            {`${t('hexData')}: ${ethUtil.toBytes(data).length} bytes`}
          </div>
          <div className="confirm-page-container-content__data-box">{data}</div>
        </div>
      )
    );
  }

  handleEdit() {
    const { txData, tokenData, tokenProps, onEdit } = this.props;

    onEdit({ txData, tokenData, tokenProps });
  }

  handleCancelAll() {
    const {
      cancelAllTransactions,
      clearConfirmTransaction,
      navigate,
      mostRecentOverviewPage,
      showRejectTransactionsConfirmationModal,
      unapprovedTxCount,
    } = this.props;

    showRejectTransactionsConfirmationModal({
      unapprovedTxCount,
      onSubmit: async () => {
        this._removeBeforeUnload();
        await cancelAllTransactions();
        clearConfirmTransaction();
        navigate(mostRecentOverviewPage);
      },
    });
  }

  handleCancel() {
    const {
      onCancel,
      txData,
      cancelTransaction,
      navigate,
      mostRecentOverviewPage,
      clearConfirmTransaction,
    } = this.props;

    this._removeBeforeUnload();
    if (onCancel) {
      onCancel(txData);
    } else {
      // eslint-disable-next-line promise/catch-or-return -- fire-and-forget from a click handler; adding a catch would swallow errors
      cancelTransaction(txData).then(() => {
        clearConfirmTransaction();
        navigate(mostRecentOverviewPage);
        return undefined;
      });
    }
  }

  handleSubmit() {
    const {
      sendTransaction,
      clearConfirmTransaction,
      txData,
      navigate,
      onSubmit,
      mostRecentOverviewPage,
    } = this.props;
    const { submitting } = this.state;

    if (submitting || this.alertAcknowledgement().needsAcknowledgement) {
      return;
    }

    this.setState(
      {
        submitting: true,
        submitError: null,
      },
      () => {
        this._removeBeforeUnload();

        if (onSubmit) {
          // eslint-disable-next-line promise/catch-or-return -- fire-and-forget from a setState callback; adding a catch would swallow onSubmit errors
          Promise.resolve(onSubmit(txData)).then(() => {
            this.setState({
              submitting: false,
            });
            return undefined;
          });
        } else {
          sendTransaction(txData)
            .then(() => {
              clearConfirmTransaction();
              this.setState(
                {
                  submitting: false,
                },
                () => navigate(mostRecentOverviewPage),
              );
              return undefined;
            })
            .catch((error) => {
              this.setState({
                submitting: false,
                submitError: error.message,
              });
            });
        }
      },
    );
  }

  renderTitleComponent() {
    const { title, titleComponent, hexTransactionAmount } = this.props;

    // Title string passed in by props takes priority
    if (title) {
      return null;
    }

    return (
      titleComponent || (
        <UserPreferencedCurrencyDisplay
          value={hexTransactionAmount}
          showEthLogo
          ethLogoHeight="26"
          hideLabel
        />
      )
    );
  }

  handleNextTx(txId) {
    const { navigate, clearConfirmTransaction } = this.props;

    if (txId) {
      clearConfirmTransaction();
      navigate(`${CONFIRM_TRANSACTION_ROUTE}/${txId}`);
    }
  }

  getNavigateTxData() {
    const { currentNetworkUnapprovedTxs, txData: { id } = {} } = this.props;
    const enumUnapprovedTxs = Object.keys(currentNetworkUnapprovedTxs);
    const currentPosition = enumUnapprovedTxs.indexOf(id ? id.toString() : '');

    return {
      totalTx: enumUnapprovedTxs.length,
      positionOfCurrentTx: currentPosition + 1,
      nextTxId: enumUnapprovedTxs[currentPosition + 1],
      prevTxId: enumUnapprovedTxs[currentPosition - 1],
      showNavigation: enumUnapprovedTxs.length > 1,
      firstTx: enumUnapprovedTxs[0],
      lastTx: enumUnapprovedTxs[enumUnapprovedTxs.length - 1],
      ofText: this.context.t('ofTextNofM'),
      requestsWaitingText: this.context.t('requestsAwaitingAcknowledgement'),
    };
  }

  _beforeUnload = () => {
    const { txData: { id } = {}, cancelTransaction } = this.props;

    cancelTransaction({ id });
  };

  _removeBeforeUnload = () => {
    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      window.removeEventListener('beforeunload', this._beforeUnload);
    }
  };

  componentDidMount() {
    const { toAddress, tryReverseResolveAddress } = this.props;

    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      window.addEventListener('beforeunload', this._beforeUnload);
    }

    if (toAddress) {
      tryReverseResolveAddress(toAddress);
    }
  }

  componentWillUnmount() {
    this._removeBeforeUnload();
  }

  render() {
    const { t } = this.context;
    const {
      isTxReprice,
      fromName,
      fromAddress,
      toName,
      toAddress,
      toEns,
      toNickname,
      methodData,
      valid: propsValid = true,
      errorMessage,
      errorKey: propsErrorKey,
      title,
      identiconAddress,
      summaryComponent,
      contentComponent,
      onEdit,
      nonce,
      assetImage,
      warning,
      unapprovedTxCount,
      transactionCategory,
      hideSenderToRecipient,
      showAccountInHeader,
    } = this.props;
    const { submitting, submitError } = this.state;
    const alertAcknowledgement = this.alertAcknowledgement();

    const { name } = methodData;
    const { valid, errorKey } = this.getErrorKey();
    const {
      totalTx,
      positionOfCurrentTx,
      nextTxId,
      prevTxId,
      showNavigation,
      firstTx,
      lastTx,
      ofText,
      requestsWaitingText,
    } = this.getNavigateTxData();

    let functionType = getMethodName(name);
    if (!functionType) {
      if (transactionCategory) {
        functionType = t(transactionCategory) || transactionCategory;
      } else {
        functionType = t('contractInteraction');
      }
    }

    return (
      <ConfirmPageContainer
        origin={this.props.txData?.origin}
        fromName={fromName}
        fromAddress={fromAddress}
        showAccountInHeader={showAccountInHeader}
        toName={toName}
        toAddress={toAddress}
        toEns={toEns}
        toNickname={toNickname}
        showEdit={onEdit && !isTxReprice}
        action={functionType}
        title={title}
        titleComponent={this.renderTitleComponent()}
        hideSubtitle
        summaryComponent={summaryComponent}
        detailsComponent={this.renderDetails()}
        dataComponent={this.renderData(functionType)}
        contentComponent={contentComponent}
        nonce={nonce}
        unapprovedTxCount={unapprovedTxCount}
        assetImage={assetImage}
        identiconAddress={identiconAddress}
        errorMessage={errorMessage || submitError}
        errorKey={propsErrorKey || errorKey}
        warning={warning}
        totalTx={totalTx}
        positionOfCurrentTx={positionOfCurrentTx}
        nextTxId={nextTxId}
        prevTxId={prevTxId}
        showNavigation={showNavigation}
        onNextTx={(txId) => this.handleNextTx(txId)}
        firstTx={firstTx}
        lastTx={lastTx}
        ofText={ofText}
        requestsWaitingText={requestsWaitingText}
        disabled={
          !propsValid ||
          !valid ||
          submitting ||
          alertAcknowledgement.needsAcknowledgement
        }
        securityAlerts={
          <>
            <SecurityAlerts {...alertAcknowledgement.alertsProps} />
            <TransactionSimulation
              simulation={this.props.txData?.simulation}
              trackedTokens={this.props.trackedTokens}
              nativeCurrency={this.props.nativeCurrency}
              stale={this.props.simulationStale}
            />
          </>
        }
        onEdit={() => this.handleEdit()}
        onCancelAll={() => this.handleCancelAll()}
        onCancel={() => this.handleCancel()}
        onSubmit={() => this.handleSubmit()}
        hideSenderToRecipient={hideSenderToRecipient}
      />
    );
  }
}

export function getMethodName(camelCase) {
  if (!camelCase || typeof camelCase !== 'string') {
    return '';
  }

  return camelCase
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z])([a-z])/gu, ' $1$2')
    .replace(/ +/gu, ' ');
}
