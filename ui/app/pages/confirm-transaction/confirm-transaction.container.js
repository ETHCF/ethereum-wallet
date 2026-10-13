import { connect } from 'react-redux';
import { compose } from 'redux';

import ConfirmTransaction from './confirm-transaction.component';
import {
  setTransactionToConfirm,
  clearConfirmTransaction,
} from '../../ducks/confirm-transaction/confirm-transaction.duck';
import { fetchBasicGasEstimates } from '../../ducks/gas/gas.duck';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import { isTokenMethodAction } from '../../helpers/utils/transactions.util';
import { unconfirmedTransactionsListSelector } from '../../selectors';
import { getContractMethodData, getTokenParams } from '../../store/actions';

const mapStateToProps = (state, ownProps) => {
  const {
    ecfWallet: { send, unapprovedTxs },
  } = state;
  const { params = {} } = ownProps;
  const { id } = params;

  const unconfirmedTransactions = unconfirmedTransactionsListSelector(state);
  const totalUnconfirmed = unconfirmedTransactions.length;
  const transaction = totalUnconfirmed
    ? unapprovedTxs[id] || unconfirmedTransactions[0]
    : {};
  const { id: transactionId, transactionCategory } = transaction;

  return {
    totalUnapprovedCount: totalUnconfirmed,
    send,
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    paramsTransactionId: id && String(id),
    transactionId: transactionId && String(transactionId),
    transaction,
    isTokenMethodAction: isTokenMethodAction(transactionCategory),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setTransactionToConfirm: (transactionId) => {
      dispatch(setTransactionToConfirm(transactionId));
    },
    clearConfirmTransaction: () => dispatch(clearConfirmTransaction()),
    fetchBasicGasEstimates: () => dispatch(fetchBasicGasEstimates()),
    getContractMethodData: (data) => dispatch(getContractMethodData(data)),
    getTokenParams: (tokenAddress) => dispatch(getTokenParams(tokenAddress)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(ConfirmTransaction);
