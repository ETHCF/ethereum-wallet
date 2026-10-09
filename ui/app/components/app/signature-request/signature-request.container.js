import { connect } from 'react-redux';

import SignatureRequest from './signature-request.component';
import { clearConfirmTransaction } from '../../../ducks/confirm-transaction/confirm-transaction.duck';
import { getAccountByAddress } from '../../../helpers/utils/util';
import { accountsWithSendEtherInfoSelector } from '../../../selectors';

function mapStateToProps(state) {
  return {
    // not forwarded to component
    allAccounts: accountsWithSendEtherInfoSelector(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    clearConfirmTransaction: () => dispatch(clearConfirmTransaction()),
  };
}

function mergeProps(stateProps, dispatchProps, ownProps) {
  const { allAccounts } = stateProps;
  const { signTypedMessage, cancelTypedMessage, txData } = ownProps;

  const {
    msgParams: { from },
  } = txData;

  const fromAccount = getAccountByAddress(allAccounts, from);

  // Only eth_signTypedData V3/V4 requests are routed here (see conf-tx.js).
  return {
    ...ownProps,
    ...dispatchProps,
    fromAccount,
    txData,
    cancel: cancelTypedMessage,
    sign: signTypedMessage,
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
)(SignatureRequest);
