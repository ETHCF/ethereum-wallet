import PropTypes from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';
import { compose } from 'redux';

import ConfirmTokenTransactionBase from './confirm-token-transaction-base.component';
import withRouter from '../../helpers/higher-order-components/with-router';
import {
  calcTokenAmount,
  getTokenToAddress,
  getTokenValue,
} from '../../helpers/utils/token-util';
import { getTokenData } from '../../helpers/utils/transactions.util';
import { useTokenDetails } from '../../hooks/useTokenDetails';
import {
  getNativeCurrencyImage,
  transactionFeeSelector,
} from '../../selectors';
import { unapprovedTxsSelector } from '../../selectors/transactions';

const mapStateToProps = (state, ownProps) => {
  const { params = {} } = ownProps;
  const { id: paramsTransactionId } = params;
  const { confirmTransaction } = state;

  const {
    txData: {
      id: transactionId,
      txParams: { to: tokenAddress, data } = {},
    } = {},
  } = confirmTransaction;

  // currentNetworkTxList is capped, so a site can push a pending transaction
  // out of it. Without the transaction there is no total to show, not a zero.
  const transaction =
    unapprovedTxsSelector(state)[Number(paramsTransactionId) || transactionId];

  const { ethTransactionTotal } = transaction
    ? transactionFeeSelector(state, transaction)
    : {};

  const tokenData = getTokenData(data);
  const tokenValue = tokenData && getTokenValue(tokenData.params);
  const toAddress = tokenData && getTokenToAddress(tokenData.params);

  return {
    toAddress,
    tokenAddress,
    tokenValue: tokenValue === undefined ? undefined : String(tokenValue),
    ethTransactionTotal,
    nativeCurrencyImage: getNativeCurrencyImage(state),
  };
};

/**
 * Shows the token amount with the token's decimals and symbol: the tracked
 * token's, or else those read from the contract. An unknown token's amount is
 * shown in raw units. Amounts stay strings, so none loses precision.
 *
 * @param {object} props - The component props.
 * @param {string} [props.tokenAddress] - The token contract.
 * @param {string} [props.tokenValue] - The amount in base units.
 * @returns {React.ReactElement} The confirmation.
 */
function ConfirmTokenTransactionWithDetails({
  tokenAddress,
  tokenValue,
  ...props
}) {
  const { symbol, decimals, loading } = useTokenDetails(tokenAddress);
  const tokenAmount =
    tokenValue === undefined || loading
      ? ''
      : calcTokenAmount(tokenValue, decimals).toFixed();
  return (
    <ConfirmTokenTransactionBase
      {...props}
      tokenAddress={tokenAddress}
      tokenAmount={tokenAmount}
      tokenSymbol={symbol}
    />
  );
}

ConfirmTokenTransactionWithDetails.propTypes = {
  tokenAddress: PropTypes.string,
  tokenValue: PropTypes.string,
};

export default compose(
  withRouter,
  connect(mapStateToProps),
)(ConfirmTokenTransactionWithDetails);
