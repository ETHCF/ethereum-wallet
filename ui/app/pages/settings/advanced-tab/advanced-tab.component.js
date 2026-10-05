import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import Button from '../../../components/ui/button';
import TextField from '../../../components/ui/text-field';

export default class AdvancedTab extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    autoLockTimeLimit: PropTypes.number,
    setAutoLockTimeLimit: PropTypes.func.isRequired,
  };

  state = {
    autoLockTimeLimit: this.props.autoLockTimeLimit,
    lockTimeError: '',
  };

  handleLockChange(time) {
    const { t } = this.context;
    const autoLockTimeLimit = Math.max(Number(time), 0);

    this.setState(() => {
      let lockTimeError = '';

      if (autoLockTimeLimit > 10080) {
        lockTimeError = t('lockTimeTooGreat');
      }

      return {
        autoLockTimeLimit,
        lockTimeError,
      };
    });
  }

  render() {
    const { t } = this.context;
    const { lockTimeError } = this.state;
    const { autoLockTimeLimit, setAutoLockTimeLimit } = this.props;

    return (
      <div className="settings-page__body">
        <div
          className="settings-page__content-row"
          data-testid="advanced-setting-auto-lock"
        >
          <div className="settings-page__content-item">
            <span>{t('autoLockTimeLimit')}</span>
            <div className="settings-page__content-description">
              {t('autoLockTimeLimitDescription')}
            </div>
          </div>
          <div className="settings-page__content-item">
            <div className="settings-page__content-item-col">
              <TextField
                type="number"
                id="autoTimeout"
                placeholder="5"
                value={this.state.autoLockTimeLimit}
                defaultValue={autoLockTimeLimit}
                onChange={(e) => this.handleLockChange(e.target.value)}
                error={lockTimeError}
                fullWidth
                margin="dense"
                min={0}
              />
              <Button
                type="primary"
                className="settings-tab__rpc-save-button"
                disabled={lockTimeError !== ''}
                onClick={() => {
                  setAutoLockTimeLimit(this.state.autoLockTimeLimit);
                }}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
