import { compose } from 'redux'
import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import {
  displayWarning,
  setFeatureFlag,
  showModal,
  setAutoLockTimeLimit,
  setUseNonceField,
  setIpfsGateway,
} from '../../../store/actions'
import { getPreferences } from '../../../selectors'
import AdvancedTab from './advanced-tab.component'

export const mapStateToProps = (state) => {
  const { appState: { warning }, ecfWallet } = state
  const {
    featureFlags: {
      sendHexData,
      transactionTime,
      advancedInlineGas,
    } = {},
    useNonceField,
    ipfsGateway,
  } = ecfWallet
  const { autoLockTimeLimit } = getPreferences(state)

  return {
    warning,
    sendHexData,
    advancedInlineGas,
    transactionTime,
    autoLockTimeLimit,
    useNonceField,
    ipfsGateway,
  }
}

export const mapDispatchToProps = (dispatch) => {
  return {
    setHexDataFeatureFlag: (shouldShow) => dispatch(setFeatureFlag('sendHexData', shouldShow)),
    displayWarning: (warning) => dispatch(displayWarning(warning)),
    showResetAccountConfirmationModal: () => dispatch(showModal({ name: 'CONFIRM_RESET_ACCOUNT' })),
    setAdvancedInlineGasFeatureFlag: (shouldShow) => dispatch(setFeatureFlag('advancedInlineGas', shouldShow)),
    setTransactionTimeFeatureFlag: (shouldShow) => dispatch(setFeatureFlag('transactionTime', shouldShow)),
    setUseNonceField: (value) => dispatch(setUseNonceField(value)),
    setAutoLockTimeLimit: (value) => {
      return dispatch(setAutoLockTimeLimit(value))
    },
    setIpfsGateway: (value) => {
      return dispatch(setIpfsGateway(value))
    },
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AdvancedTab)
