import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Route, Routes } from 'react-router-dom';

import CreatePassword from './create-password';
import EndOfFlow from './end-of-flow';
import FirstTimeFlowSwitch from './first-time-flow-switch';
import SeedPhrase from './seed-phrase';
import SelectAction from './select-action';
import Welcome from './welcome';
import {
  DEFAULT_ROUTE,
  INITIALIZE_ROUTE,
  INITIALIZE_WELCOME_ROUTE,
  INITIALIZE_CREATE_PASSWORD_ROUTE,
  INITIALIZE_SEED_PHRASE_ROUTE,
  INITIALIZE_UNLOCK_ROUTE,
  INITIALIZE_SELECT_ACTION_ROUTE,
  INITIALIZE_END_OF_FLOW_ROUTE,
  INITIALIZE_BACKUP_SEED_PHRASE_ROUTE,
} from '../../helpers/constants/routes';
import { toRelativeRoutePath } from '../../helpers/utils/routes.util';
import Unlock from '../unlock-page';

export default class FirstTimeFlow extends PureComponent {
  static propTypes = {
    completedOnboarding: PropTypes.bool,
    createNewAccount: PropTypes.func,
    createNewAccountFromSeed: PropTypes.func,
    navigate: PropTypes.func,
    isInitialized: PropTypes.bool,
    isUnlocked: PropTypes.bool,
    unlockAccount: PropTypes.func,
    nextRoute: PropTypes.string,
    showingSeedPhraseBackupAfterOnboarding: PropTypes.bool,
    seedPhraseBackedUp: PropTypes.bool,
    requestSeedPhrase: PropTypes.func,
  };

  state = {
    seedPhrase: '',
    isImportedKeyring: false,
  };

  componentDidMount() {
    const {
      completedOnboarding,
      navigate,
      isInitialized,
      isUnlocked,
      showingSeedPhraseBackupAfterOnboarding,
      seedPhraseBackedUp,
    } = this.props;

    if (
      completedOnboarding &&
      (!showingSeedPhraseBackupAfterOnboarding || seedPhraseBackedUp)
    ) {
      navigate(DEFAULT_ROUTE);
      return;
    }

    if (isInitialized && !isUnlocked) {
      navigate(INITIALIZE_UNLOCK_ROUTE);
    }
  }

  componentDidUpdate(prevProps) {
    // These routes are outside the Authenticated guard, so nothing else takes
    // the Secret Recovery Phrase off screen when the wallet locks.
    if (prevProps.isUnlocked && !this.props.isUnlocked) {
      this.setState({ seedPhrase: '' });
      this.props.navigate(INITIALIZE_UNLOCK_ROUTE);
    }
  }

  handleCreateNewAccount = async (password) => {
    const { createNewAccount } = this.props;

    try {
      const seedPhrase = await createNewAccount(password);
      this.setState({ seedPhrase });
    } catch (error) {
      throw new Error(error.message);
    }
  };

  handleImportWithSeedPhrase = async (password, seedPhrase) => {
    const { createNewAccountFromSeed } = this.props;

    try {
      const vault = await createNewAccountFromSeed(password, seedPhrase);
      this.setState({ isImportedKeyring: true });
      return vault;
    } catch (error) {
      throw new Error(error.message);
    }
  };

  handleUnlock = async (password) => {
    const { unlockAccount, navigate, nextRoute } = this.props;

    try {
      const seedPhrase = await unlockAccount(password);
      this.setState({ seedPhrase }, () => {
        navigate(nextRoute);
      });
    } catch (error) {
      throw new Error(error.message);
    }
  };

  render() {
    const { seedPhrase, isImportedKeyring } = this.state;
    const { requestSeedPhrase } = this.props;

    return (
      <div className="first-time-flow">
        <Routes>
          <Route
            path={`${toRelativeRoutePath(INITIALIZE_SEED_PHRASE_ROUTE, INITIALIZE_ROUTE)}/*`}
            element={
              <SeedPhrase
                seedPhrase={seedPhrase}
                requestSeedPhrase={requestSeedPhrase}
              />
            }
          />
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_BACKUP_SEED_PHRASE_ROUTE,
              INITIALIZE_ROUTE,
            )}
            element={
              <SeedPhrase
                seedPhrase={seedPhrase}
                requestSeedPhrase={requestSeedPhrase}
              />
            }
          />
          <Route
            path={`${toRelativeRoutePath(INITIALIZE_CREATE_PASSWORD_ROUTE, INITIALIZE_ROUTE)}/*`}
            element={
              <CreatePassword
                isImportedKeyring={isImportedKeyring}
                onCreateNewAccount={this.handleCreateNewAccount}
                onCreateNewAccountFromSeed={this.handleImportWithSeedPhrase}
              />
            }
          />
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_SELECT_ACTION_ROUTE,
              INITIALIZE_ROUTE,
            )}
            element={<SelectAction />}
          />
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_UNLOCK_ROUTE,
              INITIALIZE_ROUTE,
            )}
            element={<Unlock onSubmit={this.handleUnlock} />}
          />
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_END_OF_FLOW_ROUTE,
              INITIALIZE_ROUTE,
            )}
            element={<EndOfFlow />}
          />
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_WELCOME_ROUTE,
              INITIALIZE_ROUTE,
            )}
            element={<Welcome />}
          />
          <Route path="*" element={<FirstTimeFlowSwitch />} />
        </Routes>
      </div>
    );
  }
}
