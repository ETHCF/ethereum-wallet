import { connect } from 'react-redux'
import {
  setSeedPhraseBackedUp,
  setCompletedOnboarding,
} from '../../../../store/actions'
import withRouter from '../../../../helpers/higher-order-components/with-router'
import ConfirmSeedPhrase from './confirm-seed-phrase.component'

const mapDispatchToProps = (dispatch) => {
  return {
    setSeedPhraseBackedUp: (seedPhraseBackupState) => dispatch(setSeedPhraseBackedUp(seedPhraseBackupState)),
    completeOnboarding: () => dispatch(setCompletedOnboarding()),
  }
}

export default withRouter(connect(null, mapDispatchToProps)(ConfirmSeedPhrase))
