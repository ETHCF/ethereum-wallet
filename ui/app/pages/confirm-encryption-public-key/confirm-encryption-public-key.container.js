import { connect } from 'react-redux';

import ConfirmEncryptionPublicKey from './confirm-encryption-public-key.component';
import { mapConfirmRequestStateToProps } from '../../components/app/confirm-request-layout';
import {
  encryptionPublicKeyMsg,
  cancelEncryptionPublicKeyMsg,
} from '../../store/actions';

function mapDispatchToProps(dispatch) {
  return {
    encryptionPublicKey: (msgData, event) => {
      const params = { data: msgData.msgParams, ecfWalletId: msgData.id };
      event.stopPropagation();
      return dispatch(encryptionPublicKeyMsg(params));
    },
    cancelEncryptionPublicKey: (msgData, event) => {
      event.stopPropagation();
      return dispatch(cancelEncryptionPublicKeyMsg(msgData));
    },
  };
}

export default connect(
  mapConfirmRequestStateToProps,
  mapDispatchToProps,
)(ConfirmEncryptionPublicKey);
