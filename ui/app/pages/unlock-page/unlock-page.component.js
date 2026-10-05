import log from 'loglevel';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import Button from '../../components/ui/button';
import TextField from '../../components/ui/text-field';
import { DEFAULT_ROUTE } from '../../helpers/constants/routes';

export default class UnlockPage extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    navigate: PropTypes.func.isRequired,
    isUnlocked: PropTypes.bool,
    onImport: PropTypes.func,
    onRestore: PropTypes.func,
    onSubmit: PropTypes.func,
    forceUpdateEcfWalletState: PropTypes.func,
  };

  state = {
    password: '',
    error: null,
  };

  submitting = false;

  UNSAFE_componentWillMount() {
    const { isUnlocked, navigate } = this.props;

    if (isUnlocked) {
      navigate(DEFAULT_ROUTE);
    }
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const { password } = this.state;
    const { onSubmit, forceUpdateEcfWalletState } = this.props;

    if (password === '' || this.submitting) {
      return;
    }

    this.setState({ error: null });
    this.submitting = true;

    const { t } = this.context;

    try {
      await onSubmit(password);
    } catch (error) {
      const { message } = error;
      log.error('ecf-wallet - unlock failed', message, error);
      await forceUpdateEcfWalletState();
      this.setState({
        error: /incorrect password/iu.test(message || '')
          ? t('incorrectPassword')
          : t('unlockFailed'),
      });
      this.submitting = false;
      return;
    }

    // The vault is open at this point. Refreshing state afterwards can still
    // fail if the network is unreachable, and that must not read as a failed
    // unlock or leak a raw fetch error to the user.
    try {
      await forceUpdateEcfWalletState();
    } catch (error) {
      log.error('ecf-wallet - could not refresh state after unlock', error);
      this.setState({ error: t('unlockNetworkError') });
      this.submitting = false;
    }
  };

  handleInputChange({ target }) {
    this.setState({ password: target.value, error: null });
  }

  renderSubmitButton() {
    return (
      <Button
        type="primary"
        submit
        large
        className="unlock-page__submit"
        disabled={!this.state.password}
        onClick={this.handleSubmit}
      >
        {this.context.t('unlock')}
      </Button>
    );
  }

  render() {
    const { password, error } = this.state;
    const { t } = this.context;
    const { onImport, onRestore } = this.props;

    return (
      <div className="unlock-page__container">
        <div className="unlock-page">
          <h1 className="unlock-page__title">{t('welcomeBack')}</h1>
          <div className="unlock-page__message">{t('unlockMessage')}</div>
          <form className="unlock-page__form" onSubmit={this.handleSubmit}>
            <TextField
              id="password"
              label={t('password')}
              type="password"
              value={password}
              onChange={(event) => this.handleInputChange(event)}
              error={error}
              autoFocus
              autoComplete="current-password"
              theme="material"
              fullWidth
            />
          </form>
          {this.renderSubmitButton()}
          <div className="unlock-page__links">
            <div className="unlock-page__link" onClick={() => onRestore()}>
              {t('restoreFromSeed')}
            </div>
            <div
              className="unlock-page__link unlock-page__link--import"
              onClick={() => onImport()}
            >
              {t('importUsingSeed')}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
