import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Route, Routes } from 'react-router-dom';

import ConfirmSeedPhrase from './confirm-seed-phrase';
import RevealSeedPhrase from './reveal-seed-phrase';
import MetaFoxLogo from '../../../components/ui/metafox-logo';
import {
  INITIALIZE_SEED_PHRASE_ROUTE,
  INITIALIZE_CONFIRM_SEED_PHRASE_ROUTE,
  LOCK_ROUTE,
} from '../../../helpers/constants/routes';
import { toRelativeRoutePath } from '../../../helpers/utils/routes.util';

export default class SeedPhrase extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
    seedPhrase: PropTypes.string,
  };

  componentDidMount() {
    const { seedPhrase, navigate } = this.props;

    // The background hands over the seed phrase only with the password. If it
    // is not in memory, such as after a reload, lock the wallet so that
    // unlocking asks for the password and fetches it again.
    if (!seedPhrase) {
      navigate(LOCK_ROUTE);
    }
  }

  render() {
    const { seedPhrase } = this.props;

    return (
      <div className="first-time-flow__wrapper">
        <MetaFoxLogo />
        <Routes>
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_CONFIRM_SEED_PHRASE_ROUTE,
              INITIALIZE_SEED_PHRASE_ROUTE,
            )}
            element={<ConfirmSeedPhrase seedPhrase={seedPhrase} />}
          />
          <Route
            path={toRelativeRoutePath(
              INITIALIZE_SEED_PHRASE_ROUTE,
              INITIALIZE_SEED_PHRASE_ROUTE,
            )}
            element={<RevealSeedPhrase seedPhrase={seedPhrase} />}
          />
        </Routes>
      </div>
    );
  }
}
