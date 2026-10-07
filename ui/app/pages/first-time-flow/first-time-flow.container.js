import { connect } from 'react-redux';

import FirstTimeFlow from './first-time-flow.component';
import { INITIALIZE_BACKUP_SEED_PHRASE_ROUTE } from '../../helpers/constants/routes';
import withRouter from '../../helpers/higher-order-components/with-router';
import { getFirstTimeFlowTypeRoute } from '../../selectors';
import {
  createNewVaultAndGetSeedPhrase,
  createNewVaultAndRestore,
  getSeedPhrase,
  unlockAndGetSeedPhrase,
} from '../../store/actions';

const mapStateToProps = (state, ownProps) => {
  const {
    ecfWallet: {
      completedOnboarding,
      isInitialized,
      isUnlocked,
      seedPhraseBackedUp,
    },
  } = state;
  const showingSeedPhraseBackupAfterOnboarding = Boolean(
    ownProps.location.pathname.match(INITIALIZE_BACKUP_SEED_PHRASE_ROUTE),
  );

  return {
    completedOnboarding,
    isInitialized,
    isUnlocked,
    nextRoute: getFirstTimeFlowTypeRoute(state),
    showingSeedPhraseBackupAfterOnboarding,
    seedPhraseBackedUp,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    createNewAccount: (password) =>
      dispatch(createNewVaultAndGetSeedPhrase(password)),
    createNewAccountFromSeed: (password, seedPhrase) => {
      return dispatch(createNewVaultAndRestore(password, seedPhrase));
    },
    unlockAccount: (password) => dispatch(unlockAndGetSeedPhrase(password)),
    requestSeedPhrase: (password) => getSeedPhrase(password),
  };
};

export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(FirstTimeFlow),
);
