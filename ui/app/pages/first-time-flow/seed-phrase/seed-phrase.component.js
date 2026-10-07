import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Route, Routes } from 'react-router-dom';

import ConfirmSeedPhrase from './confirm-seed-phrase';
import RevealSeedPhrase from './reveal-seed-phrase';
import Button from '../../../components/ui/button';
import MetaFoxLogo from '../../../components/ui/metafox-logo';
import TextField from '../../../components/ui/text-field';
import {
  INITIALIZE_SEED_PHRASE_ROUTE,
  INITIALIZE_CONFIRM_SEED_PHRASE_ROUTE,
} from '../../../helpers/constants/routes';
import { toRelativeRoutePath } from '../../../helpers/utils/routes.util';

export default class SeedPhrase extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    seedPhrase: PropTypes.string,
    // Fetches the seed phrase with the password.
    requestSeedPhrase: PropTypes.func.isRequired,
  };

  state = {
    password: '',
    error: null,
    submitting: false,
    verifiedSeedPhrase: '',
  };

  // The background hands over the seed phrase only with the password. When
  // it is not in memory, such as when backing up after onboarding or after a
  // reload, ask for the password here.
  handleSubmit = async (event) => {
    event.preventDefault();
    const { password, submitting } = this.state;
    if (!password || submitting) {
      return;
    }
    this.setState({ submitting: true, error: null });
    try {
      const verifiedSeedPhrase = await this.props.requestSeedPhrase(password);
      this.setState({ verifiedSeedPhrase, password: '', submitting: false });
    } catch (_) {
      this.setState({
        error: this.context.t('incorrectPassword'),
        submitting: false,
      });
    }
  };

  renderPasswordPrompt() {
    const { t } = this.context;
    const { password, error, submitting } = this.state;

    return (
      <form className="first-time-flow__form" onSubmit={this.handleSubmit}>
        <div className="first-time-flow__header">{t('secretBackupPhrase')}</div>
        <TextField
          id="seed-phrase-password"
          label={t('enterPasswordContinue')}
          type="password"
          className="first-time-flow__input"
          value={password}
          onChange={(event) =>
            this.setState({ password: event.target.value, error: null })
          }
          error={error}
          autoFocus
          autoComplete="current-password"
          margin="normal"
          fullWidth
          largeLabel
        />
        <Button
          type="primary"
          submit
          className="first-time-flow__button"
          data-testid="seed-phrase-password-submit"
          disabled={!password || submitting}
        >
          {t('next')}
        </Button>
      </form>
    );
  }

  render() {
    const seedPhrase = this.props.seedPhrase || this.state.verifiedSeedPhrase;

    return (
      <div className="first-time-flow__wrapper">
        <MetaFoxLogo />
        {seedPhrase ? (
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
        ) : (
          this.renderPasswordPrompt()
        )}
      </div>
    );
  }
}
