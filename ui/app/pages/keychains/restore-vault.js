import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';

import Button from '../../components/ui/button';
import TextField from '../../components/ui/text-field';
import { DEFAULT_ROUTE } from '../../helpers/constants/routes';
import { SECRET_INPUT_PROPS } from '../../helpers/constants/secret-input';
import withRouter from '../../helpers/higher-order-components/with-router';
import {
  createNewVaultAndRestore,
  unMarkPasswordForgotten,
} from '../../store/actions';

class RestoreVaultPage extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    createNewVaultAndRestore: PropTypes.func.isRequired,
    leaveImportSeedScreenState: PropTypes.func,
    navigate: PropTypes.func,
    isLoading: PropTypes.bool,
  };

  state = {
    seedPhrase: '',
    showSeedPhrase: false,
    password: '',
    confirmPassword: '',
    seedPhraseError: null,
    passwordError: null,
    confirmPasswordError: null,
  };

  parseSeedPhrase = (seedPhrase) =>
    (seedPhrase || '').trim().toLowerCase().match(/\w+/gu)?.join(' ') || '';

  handleSeedPhraseChange(seedPhrase) {
    let seedPhraseError = null;

    const wordCount = this.parseSeedPhrase(seedPhrase).split(/\s/u).length;
    if (
      seedPhrase &&
      (wordCount % 3 !== 0 || wordCount < 12 || wordCount > 24)
    ) {
      seedPhraseError = this.context.t('seedPhraseReq');
    }

    this.setState({ seedPhrase, seedPhraseError });
  }

  toggleShowSeedPhrase = () => {
    this.setState(({ showSeedPhrase }) => ({
      showSeedPhrase: !showSeedPhrase,
    }));
  };

  handlePasswordChange(password) {
    const { confirmPassword } = this.state;
    let confirmPasswordError = null;
    let passwordError = null;

    if (password && password.length < 8) {
      passwordError = this.context.t('passwordNotLongEnough');
    }

    if (confirmPassword && password !== confirmPassword) {
      confirmPasswordError = this.context.t('passwordsDontMatch');
    }

    this.setState({ password, passwordError, confirmPasswordError });
  }

  handleConfirmPasswordChange(confirmPassword) {
    const { password } = this.state;
    let confirmPasswordError = null;

    if (password !== confirmPassword) {
      confirmPasswordError = this.context.t('passwordsDontMatch');
    }

    this.setState({ confirmPassword, confirmPasswordError });
  }

  onClick = () => {
    const { password, seedPhrase } = this.state;
    const { createNewVaultAndRestore, leaveImportSeedScreenState, navigate } =
      this.props;

    leaveImportSeedScreenState();
    return createNewVaultAndRestore(
      password,
      this.parseSeedPhrase(seedPhrase),
    ).then(() => {
      navigate(DEFAULT_ROUTE);
      return undefined;
    });
  };

  hasError() {
    const { passwordError, confirmPasswordError, seedPhraseError } = this.state;
    return passwordError || confirmPasswordError || seedPhraseError;
  }

  render() {
    const {
      seedPhrase,
      password,
      confirmPassword,
      seedPhraseError,
      passwordError,
      confirmPasswordError,
    } = this.state;
    const { t } = this.context;
    const { isLoading } = this.props;
    const disabled =
      !seedPhrase ||
      !password ||
      !confirmPassword ||
      isLoading ||
      this.hasError();

    return (
      <div className="first-view-main-wrapper">
        <div className="first-view-main">
          <div className="import-account">
            <a
              className="import-account__back-button"
              onClick={(e) => {
                e.preventDefault();
                this.props.leaveImportSeedScreenState();
                this.props.navigate(-1);
              }}
              href="#"
            >
              {`< Back`}
            </a>
            <div className="import-account__title">
              {this.context.t('restoreAccountWithSeed')}
            </div>
            <div className="import-account__selector-label">
              {this.context.t('secretPhrase')}
            </div>
            <div className="import-account__input-wrapper">
              <label className="import-account__input-label">Wallet Seed</label>
              {this.state.showSeedPhrase ? (
                <textarea
                  {...SECRET_INPUT_PROPS}
                  className="import-account__secret-phrase"
                  onChange={(e) => this.handleSeedPhraseChange(e.target.value)}
                  value={this.state.seedPhrase}
                  placeholder={this.context.t('separateEachWord')}
                />
              ) : (
                <TextField
                  {...SECRET_INPUT_PROPS}
                  id="seed-phrase"
                  type="password"
                  className="first-time-flow__textarea first-time-flow__seedphrase"
                  onChange={(e) => this.handleSeedPhraseChange(e.target.value)}
                  value={this.state.seedPhrase}
                  placeholder={this.context.t('seedPhrasePlaceholderPaste')}
                />
              )}
              <div
                className="first-time-flow__checkbox-container"
                onClick={this.toggleShowSeedPhrase}
              >
                <div
                  className="first-time-flow__checkbox"
                  tabIndex="0"
                  role="checkbox"
                  onKeyPress={this.toggleShowSeedPhrase}
                  aria-checked={this.state.showSeedPhrase}
                  aria-labelledby="restore-show-seed-label"
                >
                  {this.state.showSeedPhrase ? (
                    <i className="fa fa-check fa-2x" />
                  ) : null}
                </div>
                <span
                  id="restore-show-seed-label"
                  className="first-time-flow__checkbox-label"
                >
                  {this.context.t('showSeedPhrase')}
                </span>
              </div>
            </div>
            <span className="error">{seedPhraseError}</span>
            <TextField
              id="password"
              label={t('newPassword')}
              type="password"
              className="first-time-flow__input"
              value={this.state.password}
              onChange={(event) =>
                this.handlePasswordChange(event.target.value)
              }
              error={passwordError}
              autoComplete="new-password"
              margin="normal"
              largeLabel
            />
            <TextField
              id="confirm-password"
              label={t('confirmPassword')}
              type="password"
              className="first-time-flow__input"
              value={this.state.confirmPassword}
              onChange={(event) =>
                this.handleConfirmPasswordChange(event.target.value)
              }
              error={confirmPasswordError}
              autoComplete="confirm-password"
              margin="normal"
              largeLabel
            />
            <Button
              type="first-time"
              className="first-time-flow__button"
              onClick={() => !disabled && this.onClick()}
              disabled={disabled}
            >
              {this.context.t('restore')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

// For tests, without the store and router.
export { RestoreVaultPage as UnconnectedRestoreVaultPage };

export default withRouter(
  connect(
    ({ appState: { isLoading } }) => ({ isLoading }),
    (dispatch) => ({
      leaveImportSeedScreenState: () => {
        dispatch(unMarkPasswordForgotten());
      },
      createNewVaultAndRestore: (pw, seed) =>
        dispatch(createNewVaultAndRestore(pw, seed)),
    }),
  )(RestoreVaultPage),
);
