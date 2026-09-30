import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import { compose } from 'redux'
import {
  getNetworkIdentifier,
  hasPermissionRequests,
  getPreferences,
  submittedPendingTransactionsSelector,
} from '../../selectors'
import {
  hideSidebar,
  lockEcfWallet,
  setCurrentCurrency,
  setLastActiveTime,
  setMouseUserState,
} from '../../store/actions'
import { pageChanged } from '../../ducks/history/history'
import Routes from './routes.component'

function mapStateToProps (state) {
  const { appState } = state
  const {
    sidebar,
    alertOpen,
    alertMessage,
    isLoading,
    loadingMessage,
  } = appState
  const { autoLockTimeLimit = 0 } = getPreferences(state)

  return {
    sidebar,
    alertOpen,
    alertMessage,
    textDirection: state.ecfWallet.textDirection,
    isLoading,
    loadingMessage,
    isUnlocked: state.ecfWallet.isUnlocked,
    submittedPendingTransactions: submittedPendingTransactionsSelector(state),
    network: state.ecfWallet.network,
    provider: state.ecfWallet.provider,
    frequentRpcListDetail: state.ecfWallet.frequentRpcListDetail || [],
    currentCurrency: state.ecfWallet.currentCurrency,
    isMouseUser: state.appState.isMouseUser,
    providerId: getNetworkIdentifier(state),
    autoLockTimeLimit,
    hasPermissionsRequests: hasPermissionRequests(state),
  }
}

function mapDispatchToProps (dispatch) {
  return {
    lockEcfWallet: () => dispatch(lockEcfWallet(false)),
    hideSidebar: () => dispatch(hideSidebar()),
    setCurrentCurrencyToUSD: () => dispatch(setCurrentCurrency('usd')),
    setMouseUserState: (isMouseUser) => dispatch(setMouseUserState(isMouseUser)),
    setLastActiveTime: () => dispatch(setLastActiveTime()),
    pageChanged: (path) => dispatch(pageChanged(path)),
  }
}

export default compose(withRouter, connect(mapStateToProps, mapDispatchToProps))(Routes)
