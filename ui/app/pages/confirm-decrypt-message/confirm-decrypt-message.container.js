import { connect } from 'react-redux';
import { compose } from 'redux';

import ConfirmDecryptMessage from './confirm-decrypt-message.component';
import { clearConfirmTransaction } from '../../ducks/confirm-transaction/confirm-transaction.duck';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import {
  getTargetAccountWithSendEtherInfo,
  getNativeCurrency,
} from '../../selectors';
import {
  goHome,
  decryptMsg,
  cancelDecryptMsg,
  decryptMsgInline,
} from '../../store/actions';

function mapStateToProps(state) {
  const {
    confirmTransaction,
    ecfWallet: { domainMetadata = {} },
  } = state;

  const { txData = {} } = confirmTransaction;

  const {
    msgParams: { from },
  } = txData;

  const fromAccount = getTargetAccountWithSendEtherInfo(state, from);

  return {
    txData,
    domainMetadata,
    fromAccount,
    requester: null,
    requesterAddress: null,
    nativeCurrency: getNativeCurrency(state),
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    goHome: () => dispatch(goHome()),
    clearConfirmTransaction: () => dispatch(clearConfirmTransaction()),
    decryptMessage: (msgData, event) => {
      const params = msgData.msgParams;
      params.ecfWalletId = msgData.id;
      event.stopPropagation(event);
      return dispatch(decryptMsg(params));
    },
    cancelDecryptMessage: (msgData, event) => {
      event.stopPropagation(event);
      return dispatch(cancelDecryptMsg(msgData));
    },
    decryptMessageInline: (msgData, event) => {
      const params = msgData.msgParams;
      params.ecfWalletId = msgData.id;
      event.stopPropagation(event);
      return dispatch(decryptMsgInline(params));
    },
  };
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(ConfirmDecryptMessage);
