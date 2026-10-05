import { connect } from 'react-redux';
import { compose } from 'redux';

import CancelTransaction from './cancel-transaction.component';
import { bumpFee } from '../../../../../../app/scripts/lib/transaction-fees';
import withModalProps from '../../../../helpers/higher-order-components/with-modal-props';
import { getHexGasTotal } from '../../../../helpers/utils/confirm-tx.util';
import { showModal, createCancelTransaction } from '../../../../store/actions';

const mapStateToProps = (state, ownProps) => {
  const { ecfWallet } = state;
  const { transactionId, originalGasPrice } = ownProps;
  const { currentNetworkTxList } = ecfWallet;
  const transaction = currentNetworkTxList.find(
    ({ id }) => id === transactionId,
  );
  const transactionStatus = transaction ? transaction.status : '';

  const defaultNewGasPrice = bumpFee(originalGasPrice);

  const newGasFee = getHexGasTotal({
    gasPrice: defaultNewGasPrice,
    gasLimit: '0x5208',
  });

  return {
    transactionId,
    transactionStatus,
    originalGasPrice,
    defaultNewGasPrice,
    newGasFee,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    createCancelTransaction: (txId, customGasPrice) => {
      return dispatch(createCancelTransaction(txId, customGasPrice));
    },
    showTransactionConfirmedModal: () =>
      dispatch(showModal({ name: 'TRANSACTION_CONFIRMED' })),
  };
};

const mergeProps = (stateProps, dispatchProps, ownProps) => {
  const { transactionId, defaultNewGasPrice, ...restStateProps } = stateProps;

  const { createCancelTransaction, ...restDispatchProps } = dispatchProps;

  return {
    ...restStateProps,
    ...restDispatchProps,
    ...ownProps,
    createCancelTransaction: () =>
      createCancelTransaction(transactionId, defaultNewGasPrice),
  };
};

export default compose(
  withModalProps,
  connect(mapStateToProps, mapDispatchToProps, mergeProps),
)(CancelTransaction);
