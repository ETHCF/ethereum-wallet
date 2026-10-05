import PropTypes from 'prop-types';
import React, { Component } from 'react';

import AdvancedTabContent from './advanced-tab-content';
import BasicTabContent from './basic-tab-content';
import FeeMarketInputs from '../../../../pages/confirm-transaction-base/fee-market-inputs';
import PageContainer from '../../../ui/page-container';
import { Tabs, Tab } from '../../../ui/tabs';

export default class GasModalPageContainer extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    hideBasic: PropTypes.bool,
    feeMarketParams: PropTypes.object,
    minimumMaxFeePerGas: PropTypes.string,
    updateCustomGasPrice: PropTypes.func,
    updateCustomGasLimit: PropTypes.func,
    insufficientBalance: PropTypes.bool,
    fetchBasicGasEstimates: PropTypes.func,
    gasPriceButtonGroupProps: PropTypes.object,
    infoRowProps: PropTypes.shape({
      originalTotalEth: PropTypes.string,
      newTotalEth: PropTypes.string,
      sendAmount: PropTypes.string,
      transactionFee: PropTypes.string,
    }),
    onSubmit: PropTypes.func,
    customModalGasPriceInHex: PropTypes.string,
    customModalGasLimitInHex: PropTypes.string,
    cancelAndClose: PropTypes.func,
    customPriceIsSafe: PropTypes.bool,
    isSpeedUp: PropTypes.bool,
    isRetry: PropTypes.bool,
    disableSave: PropTypes.bool,
  };

  state = {};

  componentDidMount() {
    if (!this.props.feeMarketParams) {
      this.props.fetchBasicGasEstimates();
    }
  }

  renderBasicTabContent(gasPriceButtonGroupProps) {
    return (
      <BasicTabContent gasPriceButtonGroupProps={gasPriceButtonGroupProps} />
    );
  }

  renderAdvancedTabContent() {
    const {
      updateCustomGasPrice,
      updateCustomGasLimit,
      customModalGasPriceInHex,
      customModalGasLimitInHex,
      insufficientBalance,
      customPriceIsSafe,
      isSpeedUp,
      isRetry,
      infoRowProps: { transactionFee },
    } = this.props;

    return (
      <AdvancedTabContent
        updateCustomGasPrice={updateCustomGasPrice}
        updateCustomGasLimit={updateCustomGasLimit}
        customModalGasPriceInHex={customModalGasPriceInHex}
        customModalGasLimitInHex={customModalGasLimitInHex}
        transactionFee={transactionFee}
        insufficientBalance={insufficientBalance}
        customPriceIsSafe={customPriceIsSafe}
        isSpeedUp={isSpeedUp}
        isRetry={isRetry}
      />
    );
  }

  renderInfoRows(newTotalEth, sendAmount, transactionFee) {
    return (
      <div className="gas-modal-content__info-row-wrapper">
        <div className="gas-modal-content__info-row">
          <div className="gas-modal-content__info-row__send-info">
            <span className="gas-modal-content__info-row__send-info__label">
              {this.context.t('sendAmount')}
            </span>
            <span className="gas-modal-content__info-row__send-info__value">
              {sendAmount}
            </span>
          </div>
          <div className="gas-modal-content__info-row__transaction-info">
            <span className="gas-modal-content__info-row__transaction-info__label">
              {this.context.t('transactionFee')}
            </span>
            <span className="gas-modal-content__info-row__transaction-info__value">
              {transactionFee}
            </span>
          </div>
          <div className="gas-modal-content__info-row__total-info">
            <span className="gas-modal-content__info-row__total-info__label">
              {this.context.t('newTotal')}
            </span>
            <span className="gas-modal-content__info-row__total-info__value">
              {newTotalEth}
            </span>
          </div>
        </div>
      </div>
    );
  }

  renderTabs() {
    const {
      feeMarketParams,
      minimumMaxFeePerGas,
      updateCustomGasPrice,
      updateCustomGasLimit,
    } = this.props;
    if (feeMarketParams) {
      return (
        <div className="gas-modal-content">
          <FeeMarketInputs
            params={feeMarketParams}
            minimumMaxFeePerGas={minimumMaxFeePerGas}
            priorityReadOnly
            onChange={({ maxFeePerGas, gasLimit }) => {
              updateCustomGasPrice(maxFeePerGas);
              updateCustomGasLimit(gasLimit);
            }}
            onValidityChange={(valid) =>
              this.setState({ feeInputInvalid: !valid })
            }
          />
          {(this.props.isSpeedUp || this.props.isRetry) && (
            <p>
              The priority fee is increased automatically for this replacement.
            </p>
          )}
        </div>
      );
    }

    const {
      gasPriceButtonGroupProps,
      hideBasic,
      infoRowProps: { newTotalEth, sendAmount, transactionFee },
    } = this.props;

    let tabsToRender = [
      {
        name: this.context.t('basic'),
        content: this.renderBasicTabContent(gasPriceButtonGroupProps),
      },
      {
        name: this.context.t('advanced'),
        content: this.renderAdvancedTabContent(),
      },
    ];

    if (hideBasic) {
      tabsToRender = tabsToRender.slice(1);
    }

    return (
      <Tabs>
        {tabsToRender.map(({ name, content }, i) => (
          <Tab name={name} key={`gas-modal-tab-${i}`}>
            <div className="gas-modal-content">
              {content}
              {this.renderInfoRows(newTotalEth, sendAmount, transactionFee)}
            </div>
          </Tab>
        ))}
      </Tabs>
    );
  }

  render() {
    const {
      cancelAndClose,
      onSubmit,
      customModalGasPriceInHex,
      customModalGasLimitInHex,
      disableSave,
    } = this.props;

    return (
      <div className="gas-modal-page-container">
        <PageContainer
          title={this.context.t('customGas')}
          subtitle={this.context.t('customGasSubTitle')}
          tabsComponent={this.renderTabs()}
          disabled={Boolean(disableSave || this.state.feeInputInvalid)}
          onCancel={() => cancelAndClose()}
          onClose={() => cancelAndClose()}
          onSubmit={() => {
            onSubmit(customModalGasLimitInHex, customModalGasPriceInHex);
          }}
          submitText={this.context.t('save')}
          headerCloseText={this.context.t('close')}
          hideCancel
        />
      </div>
    );
  }
}
