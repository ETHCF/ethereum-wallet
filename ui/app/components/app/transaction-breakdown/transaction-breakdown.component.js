import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import TransactionBreakdownRow from './transaction-breakdown-row';
import { GWEI } from '../../../helpers/constants/common';
import CurrencyDisplay from '../../ui/currency-display';
import HexToDecimal from '../../ui/hex-to-decimal';
import UserPreferencedCurrencyDisplay from '../user-preferenced-currency-display';

export default class TransactionBreakdown extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    className: PropTypes.string,
    nativeCurrency: PropTypes.string,
    nonce: PropTypes.string,
    gas: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    gasPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    gasUsed: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    totalInHex: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  };

  render() {
    const { t } = this.context;
    const {
      gas,
      gasPrice,
      value,
      className,
      nonce,
      nativeCurrency,
      totalInHex,
      gasUsed,
    } = this.props;
    return (
      <div className={classnames('transaction-breakdown', className)}>
        <div className="transaction-breakdown__title">{t('transaction')}</div>
        <TransactionBreakdownRow title="Nonce">
          {typeof nonce === 'undefined' ? null : (
            <HexToDecimal
              className="transaction-breakdown__value"
              value={nonce}
            />
          )}
        </TransactionBreakdownRow>
        <TransactionBreakdownRow title={t('amount')}>
          <UserPreferencedCurrencyDisplay
            className="transaction-breakdown__value"
            value={value}
          />
        </TransactionBreakdownRow>
        <TransactionBreakdownRow
          title={`${t('gasLimit')} (${t('units')})`}
          className="transaction-breakdown__row-title"
        >
          {typeof gas === 'undefined' ? (
            '?'
          ) : (
            <HexToDecimal
              className="transaction-breakdown__value"
              value={gas}
            />
          )}
        </TransactionBreakdownRow>
        {typeof gasUsed === 'string' && (
          <TransactionBreakdownRow
            title={`${t('gasUsed')} (${t('units')})`}
            className="transaction-breakdown__row-title"
          >
            <HexToDecimal
              className="transaction-breakdown__value"
              value={gasUsed}
            />
          </TransactionBreakdownRow>
        )}
        <TransactionBreakdownRow title={t('gasPrice')}>
          {typeof gasPrice === 'undefined' ? (
            '?'
          ) : (
            <CurrencyDisplay
              className="transaction-breakdown__value"
              data-testid="transaction-breakdown__gas-price"
              currency={nativeCurrency}
              denomination={GWEI}
              value={gasPrice}
              hideLabel
            />
          )}
        </TransactionBreakdownRow>
        <TransactionBreakdownRow title={t('total')}>
          <UserPreferencedCurrencyDisplay
            className="transaction-breakdown__value transaction-breakdown__value--eth-total"
            value={totalInHex}
          />
        </TransactionBreakdownRow>
      </div>
    );
  }
}
