import { connect } from 'react-redux'
import { displayWarning, requestRevealSeedWords, fetchInfoToSync, exportAccounts } from '../../store/actions'
import { getMostRecentOverviewPage } from '../../ducks/history/history'
import { getEcfWalletKeyrings } from '../../selectors'
import MobileSyncPage from './mobile-sync.component'

const mapDispatchToProps = (dispatch) => {
  return {
    requestRevealSeedWords: (password) => dispatch(requestRevealSeedWords(password)),
    fetchInfoToSync: () => dispatch(fetchInfoToSync()),
    displayWarning: (message) => dispatch(displayWarning(message || null)),
    exportAccounts: (password, addresses) => dispatch(exportAccounts(password, addresses)),
  }
}

const mapStateToProps = (state) => {
  const {
    ecfWallet: {
      selectedAddress,
    },
  } = state

  return {
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    selectedAddress,
    keyrings: getEcfWalletKeyrings(state),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(MobileSyncPage)
