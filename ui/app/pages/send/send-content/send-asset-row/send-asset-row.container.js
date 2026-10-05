import { connect } from 'react-redux';

import SendAssetRow from './send-asset-row.component';
import {
  getEcfWalletAccounts,
  getSendTokenAddress,
} from '../../../../selectors';
import { updateSendToken } from '../../../../store/actions';

function mapStateToProps(state) {
  return {
    tokens: state.ecfWallet.tokens,
    selectedAddress: state.ecfWallet.selectedAddress,
    sendTokenAddress: getSendTokenAddress(state),
    accounts: getEcfWalletAccounts(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    setSendToken: (token) => dispatch(updateSendToken(token)),
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(SendAssetRow);
