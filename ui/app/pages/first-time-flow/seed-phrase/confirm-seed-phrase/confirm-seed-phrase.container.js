import { connect } from 'react-redux';

import ConfirmSeedPhrase from './confirm-seed-phrase.component';
import withRouter from '../../../../helpers/higher-order-components/with-router';
import {
  setSeedPhraseBackedUp,
  setCompletedOnboarding,
} from '../../../../store/actions';

const mapDispatchToProps = (dispatch) => {
  return {
    setSeedPhraseBackedUp: (seedPhraseBackupState) =>
      dispatch(setSeedPhraseBackedUp(seedPhraseBackupState)),
    completeOnboarding: () => dispatch(setCompletedOnboarding()),
  };
};

export default withRouter(connect(null, mapDispatchToProps)(ConfirmSeedPhrase));
