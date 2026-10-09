import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import locales from '../../../../../app/_locales/index.json';
import SimpleDropdown from '../../../components/app/dropdowns/simple-dropdown';
import Button from '../../../components/ui/button';
import TextField from '../../../components/ui/text-field';
import { THEME_TYPES } from '../../../helpers/constants/themes';

const localeOptions = locales.map((locale) => {
  return {
    displayValue: `${locale.name}`,
    key: locale.code,
    value: locale.code,
  };
});

export default class SettingsTab extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    warning: PropTypes.string,
    updateCurrentLocale: PropTypes.func,
    currentLocale: PropTypes.string,
    theme: PropTypes.string,
    setThemePreference: PropTypes.func,
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

  renderCurrentLocale() {
    const { t } = this.context;
    const { updateCurrentLocale, currentLocale } = this.props;
    const currentLocaleMeta = locales.find(
      (locale) => locale.code === currentLocale,
    );
    const currentLocaleName = currentLocaleMeta ? currentLocaleMeta.name : '';

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span className="settings-page__content-label">
            {t('currentLanguage')}
          </span>
          <span className="settings-page__content-description">
            {currentLocaleName}
          </span>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <SimpleDropdown
              placeholder={t('selectLocale')}
              options={localeOptions}
              selectedOption={currentLocale}
              onSelect={async (newLocale) => updateCurrentLocale(newLocale)}
            />
          </div>
        </div>
      </div>
    );
  }

  renderTheme() {
    const { t } = this.context;
    const { theme, setThemePreference } = this.props;
    const themeOptions = [
      {
        displayValue: t('lightTheme'),
        key: THEME_TYPES.LIGHT,
        value: THEME_TYPES.LIGHT,
      },
      {
        displayValue: t('darkTheme'),
        key: THEME_TYPES.DARK,
        value: THEME_TYPES.DARK,
      },
      {
        displayValue: t('osTheme'),
        key: THEME_TYPES.OS,
        value: THEME_TYPES.OS,
      },
    ];

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span>{t('theme')}</span>
          <span className="settings-page__content-description">
            {t('themeDescription')}
          </span>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <SimpleDropdown
              placeholder={t('theme')}
              options={themeOptions}
              selectedOption={theme || THEME_TYPES.OS}
              onSelect={(newTheme) => setThemePreference(newTheme)}
            />
          </div>
        </div>
      </div>
    );
  }

  renderAutoLock() {
    const { t } = this.context;
    const { autoLockTimeLimit, lockTimeError } = this.state;
    const { setAutoLockTimeLimit } = this.props;

    return (
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
              value={autoLockTimeLimit ?? ''}
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
              onClick={() => setAutoLockTimeLimit(autoLockTimeLimit)}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  render() {
    const { warning } = this.props;

    return (
      <div className="settings-page__body">
        {warning && <div className="settings-tab__error">{warning}</div>}
        {this.renderCurrentLocale()}
        {this.renderTheme()}
        {this.renderAutoLock()}
      </div>
    );
  }
}
