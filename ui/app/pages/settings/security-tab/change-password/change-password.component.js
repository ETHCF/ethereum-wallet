import log from 'loglevel';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import { INCORRECT_PASSWORD_MESSAGE } from '../../../../../../app/scripts/lib/enums';
import Button from '../../../../components/ui/button';
import TextField from '../../../../components/ui/text-field';

const MIN_PASSWORD_LENGTH = 8;

const EMPTY_FIELDS = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  currentPasswordError: '',
  submitError: '',
};

export default class ChangePassword extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    changePassword: PropTypes.func.isRequired,
  };

  state = {
    ...EMPTY_FIELDS,
    pending: false,
    changed: false,
  };

  componentWillUnmount() {
    this.unmounted = true;
  }

  getNewPasswordError() {
    const { t } = this.context;
    const { currentPassword, newPassword } = this.state;
    if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
      return t('passwordNotLongEnough');
    }
    if (newPassword && newPassword === currentPassword) {
      return t('newPasswordSameAsCurrent');
    }
    return '';
  }

  getConfirmPasswordError() {
    const { t } = this.context;
    const { newPassword, confirmPassword } = this.state;
    return confirmPassword && confirmPassword !== newPassword
      ? t('passwordsDontMatch')
      : '';
  }

  isValid() {
    const { currentPassword, newPassword, confirmPassword } = this.state;
    return Boolean(
      currentPassword &&
      newPassword &&
      confirmPassword &&
      !this.getNewPasswordError() &&
      !this.getConfirmPasswordError(),
    );
  }

  handleChange(field, value) {
    this.setState({
      [field]: value,
      changed: false,
      submitError: '',
      ...(field === 'currentPassword' ? { currentPasswordError: '' } : {}),
    });
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    if (!this.isValid() || this.state.pending) {
      return;
    }
    const { t } = this.context;
    const { currentPassword, newPassword } = this.state;
    this.setState({ pending: true, changed: false, submitError: '' });
    try {
      await this.props.changePassword(currentPassword, newPassword);
      if (!this.unmounted) {
        this.setState({ ...EMPTY_FIELDS, pending: false, changed: true });
      }
    } catch (error) {
      if (this.unmounted) {
        return;
      }
      if (error?.message === INCORRECT_PASSWORD_MESSAGE) {
        this.setState({
          pending: false,
          currentPasswordError: t('incorrectPassword'),
        });
      } else {
        log.error(error);
        this.setState({
          pending: false,
          submitError: t('changePasswordFailed'),
        });
      }
    }
  };

  render() {
    const { t } = this.context;
    const {
      currentPassword,
      newPassword,
      confirmPassword,
      currentPasswordError,
      submitError,
      pending,
      changed,
    } = this.state;

    return (
      <div className="settings-page__content-row" data-testid="change-password">
        <div className="settings-page__content-item">
          <span>{t('changePassword')}</span>
          <div className="settings-page__content-description">
            {t('changePasswordDescription')}
          </div>
        </div>
        <div className="settings-page__content-item">
          <form
            className="settings-page__content-item-col"
            onSubmit={this.handleSubmit}
          >
            <TextField
              id="change-password-current"
              label={t('currentPassword')}
              type="password"
              value={currentPassword}
              onChange={(event) =>
                this.handleChange('currentPassword', event.target.value)
              }
              error={currentPasswordError}
              disabled={pending}
              autoComplete="current-password"
              margin="dense"
              fullWidth
            />
            <TextField
              id="change-password-new"
              label={t('newPassword')}
              type="password"
              value={newPassword}
              onChange={(event) =>
                this.handleChange('newPassword', event.target.value)
              }
              error={this.getNewPasswordError()}
              disabled={pending}
              autoComplete="new-password"
              margin="dense"
              fullWidth
            />
            <TextField
              id="change-password-confirm"
              label={t('confirmPassword')}
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                this.handleChange('confirmPassword', event.target.value)
              }
              error={this.getConfirmPasswordError()}
              disabled={pending}
              autoComplete="new-password"
              margin="dense"
              fullWidth
            />
            {submitError && (
              <div className="settings-tab__error" role="alert">
                {submitError}
              </div>
            )}
            {changed && (
              <div className="settings-page__content-description" role="status">
                {t('passwordChanged')}
              </div>
            )}
            <Button type="primary" submit disabled={!this.isValid() || pending}>
              {t('changePassword')}
            </Button>
          </form>
        </div>
      </div>
    );
  }
}
