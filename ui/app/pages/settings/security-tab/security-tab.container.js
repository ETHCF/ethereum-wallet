import { compose } from 'redux'
import { connect } from 'react-redux'
import withRouter from '../../../helpers/higher-order-components/with-router'
import {
  setFeatureFlag,
  setUsePhishDetect,
} from '../../../store/actions'
import SecurityTab from './security-tab.component'

const mapStateToProps = (state) => {
  const { appState: { warning }, ecfWallet } = state
  const {
    featureFlags: {
      showIncomingTransactions,
    } = {},
    usePhishDetect,
  } = ecfWallet

  return {
    warning,
    showIncomingTransactions,
    usePhishDetect,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    setShowIncomingTransactionsFeatureFlag: (shouldShow) => dispatch(setFeatureFlag('showIncomingTransactions', shouldShow)),
    setUsePhishDetect: (val) => dispatch(setUsePhishDetect(val)),
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(SecurityTab)
