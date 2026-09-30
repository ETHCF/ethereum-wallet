import { connect } from 'react-redux'
import { getEcfWalletAccounts, getSendTokenAddress } from '../../../../selectors'
import { updateSendToken } from '../../../../store/actions'
import SendAssetRow from './send-asset-row.component'

function mapStateToProps (state) {
  return {
    tokens: state.ecfWallet.tokens,
    selectedAddress: state.ecfWallet.selectedAddress,
    sendTokenAddress: getSendTokenAddress(state),
    accounts: getEcfWalletAccounts(state),
  }
}

function mapDispatchToProps (dispatch) {
  return {
    setSendToken: (token) => dispatch(updateSendToken(token)),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SendAssetRow)
