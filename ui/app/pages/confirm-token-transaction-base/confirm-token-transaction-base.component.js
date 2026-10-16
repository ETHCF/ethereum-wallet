import PropTypes from 'prop-types';
import React, { Component } from 'react';

import ConfirmTransactionBase from '../confirm-transaction-base';

export default class ConfirmTokenTransactionBase extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    tokenAddress: PropTypes.string,
    toAddress: PropTypes.string,
    // A decimal string, so large or precise amounts stay exact
    tokenAmount: PropTypes.string,
    tokenSymbol: PropTypes.string,
    ethTransactionTotal: PropTypes.string,
    nativeCurrencyImage: PropTypes.string,
  };

  static defaultProps = {
    tokenAmount: '',
  };

  renderPrimaryTotalTextOverride() {
    const {
      tokenAmount,
      tokenSymbol,
      ethTransactionTotal,
      nativeCurrencyImage,
    } = this.props;
    const tokensText = `${tokenAmount} ${tokenSymbol}`;

    return (
      <div>
        <span>{`${tokensText} + `}</span>
        <img src={nativeCurrencyImage || '/images/eth.svg'} height="18" />
        <span>{ethTransactionTotal}</span>
      </div>
    );
  }

  render() {
    const { toAddress, tokenAddress, tokenSymbol, tokenAmount, ...restProps } =
      this.props;

    const tokensText = `${tokenAmount} ${tokenSymbol}`;

    return (
      <ConfirmTransactionBase
        toAddress={toAddress}
        identiconAddress={tokenAddress}
        title={tokensText}
        primaryTotalTextOverride={this.renderPrimaryTotalTextOverride()}
        {...restProps}
      />
    );
  }
}
