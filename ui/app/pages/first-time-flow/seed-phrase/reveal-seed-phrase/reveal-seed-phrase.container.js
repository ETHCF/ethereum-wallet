import { connect } from 'react-redux';

import RevealSeedPhrase from './reveal-seed-phrase.component';
import withRouter from '../../../../helpers/higher-order-components/with-router';
import { getOnboardingInitiator } from '../../../../selectors';
import {
  setCompletedOnboarding,
  setSeedPhraseBackedUp,
} from '../../../../store/actions';

const mapStateToProps = (state) => {
  return {
    onboardingInitiator: getOnboardingInitiator(state),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setSeedPhraseBackedUp: (seedPhraseBackupState) =>
      dispatch(setSeedPhraseBackedUp(seedPhraseBackupState)),
    setCompletedOnboarding: () => dispatch(setCompletedOnboarding()),
  };
};

export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(RevealSeedPhrase),
);
