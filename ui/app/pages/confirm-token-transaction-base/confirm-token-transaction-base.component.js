import React, { Component } from 'react'
import PropTypes from 'prop-types'
import ConfirmTransactionBase from '../confirm-transaction-base'
import { formatCurrency } from '../../helpers/utils/confirm-tx.util'

export default class ConfirmTokenTransactionBase extends Component {
  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    tokenAddress: PropTypes.string,
    toAddress: PropTypes.string,
    tokenAmount: PropTypes.number,
    tokenSymbol: PropTypes.string,
    fiatTransactionTotal: PropTypes.string,
    ethTransactionTotal: PropTypes.string,
    currentCurrency: PropTypes.string,
    nativeCurrencyImage: PropTypes.string,
  }

  static defaultProps = {
    tokenAmount: 0,
  }

  renderPrimaryTotalTextOverride () {
    const { tokenAmount, tokenSymbol, ethTransactionTotal, nativeCurrencyImage } = this.props
    const tokensText = `${tokenAmount} ${tokenSymbol}`

    return (
      <div>
        <span>{ `${tokensText} + ` }</span>
        <img
          src={nativeCurrencyImage || '/images/eth.svg'}
          height="18"
        />
        <span>{ ethTransactionTotal }</span>
      </div>
    )
  }

  // Tokens have no price, so the fiat total covers the network fee only.
  getSecondaryTotalTextOverride () {
    const { fiatTransactionTotal, currentCurrency } = this.props
    return formatCurrency(fiatTransactionTotal, currentCurrency)
  }

  render () {
    const {
      toAddress,
      tokenAddress,
      tokenSymbol,
      tokenAmount,
      ...restProps
    } = this.props

    const tokensText = `${tokenAmount} ${tokenSymbol}`

    return (
      <ConfirmTransactionBase
        toAddress={toAddress}
        identiconAddress={tokenAddress}
        title={tokensText}
        primaryTotalTextOverride={this.renderPrimaryTotalTextOverride()}
        secondaryTotalTextOverride={this.getSecondaryTotalTextOverride()}
        {...restProps}
      />
    )
  }
}
