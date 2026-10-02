import { connect } from 'react-redux'
import {
  setSeedPhraseBackedUp,
  setCompletedOnboarding,
} from '../../../../store/actions'
import withRouter from '../../../../helpers/higher-order-components/with-router'
import ImportWithSeedPhrase from './import-with-seed-phrase.component'

const mapDispatchToProps = (dispatch) => {
  return {
    setSeedPhraseBackedUp: (seedPhraseBackupState) => dispatch(setSeedPhraseBackedUp(seedPhraseBackupState)),
    completeOnboarding: () => dispatch(setCompletedOnboarding()),
  }
}

export default withRouter(connect(null, mapDispatchToProps)(ImportWithSeedPhrase))
