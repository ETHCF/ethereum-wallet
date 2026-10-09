import { connect } from 'react-redux';

import ConfirmDecryptMessage from './confirm-decrypt-message.component';
import { mapConfirmRequestStateToProps } from '../../components/app/confirm-request-layout';
import {
  decryptMsg,
  cancelDecryptMsg,
  decryptMsgInline,
} from '../../store/actions';

function mapDispatchToProps(dispatch) {
  return {
    decryptMessage: (msgData, event) => {
      const params = msgData.msgParams;
      params.ecfWalletId = msgData.id;
      event.stopPropagation();
      return dispatch(decryptMsg(params));
    },
    cancelDecryptMessage: (msgData, event) => {
      event.stopPropagation();
      return dispatch(cancelDecryptMsg(msgData));
    },
    decryptMessageInline: (msgData, event) => {
      const params = msgData.msgParams;
      params.ecfWalletId = msgData.id;
      event.stopPropagation();
      return dispatch(decryptMsgInline(params));
    },
  };
}

export default connect(
  mapConfirmRequestStateToProps,
  mapDispatchToProps,
)(ConfirmDecryptMessage);
