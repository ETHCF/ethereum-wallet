import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import SimpleDropdown from '../../../components/app/dropdowns/simple-dropdown'
import ToggleButton from '../../../components/ui/toggle-button'
import locales from '../../../../../app/_locales/index.json'
import { THEME_TYPES } from '../../../helpers/constants/themes'

const localeOptions = locales.map((locale) => {
  return {
    displayValue: `${locale.name}`,
    key: locale.code,
    value: locale.code,
  }
})

export default class SettingsTab extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    setUseBlockie: PropTypes.func,
    warning: PropTypes.string,
    updateCurrentLocale: PropTypes.func,
    currentLocale: PropTypes.string,
    useBlockie: PropTypes.bool,
    theme: PropTypes.string,
    setThemePreference: PropTypes.func,
  }

  renderCurrentLocale () {
    const { t } = this.context
    const { updateCurrentLocale, currentLocale } = this.props
    const currentLocaleMeta = locales.find((locale) => locale.code === currentLocale)
    const currentLocaleName = currentLocaleMeta ? currentLocaleMeta.name : ''

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span className="settings-page__content-label">
            { t('currentLanguage') }
          </span>
          <span className="settings-page__content-description">
            { currentLocaleName }
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
    )
  }

  renderTheme () {
    const { t } = this.context
    const { theme, setThemePreference } = this.props
    const themeOptions = [
      { displayValue: t('lightTheme'), key: THEME_TYPES.LIGHT, value: THEME_TYPES.LIGHT },
      { displayValue: t('darkTheme'), key: THEME_TYPES.DARK, value: THEME_TYPES.DARK },
      { displayValue: t('osTheme'), key: THEME_TYPES.OS, value: THEME_TYPES.OS },
    ]

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span>{ t('theme') }</span>
          <span className="settings-page__content-description">
            { t('themeDescription') }
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
    )
  }

  renderBlockieOptIn () {
    const { t } = this.context
    const { useBlockie, setUseBlockie } = this.props

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span>{ this.context.t('blockiesIdenticon') }</span>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <ToggleButton
              value={useBlockie}
              onToggle={(value) => setUseBlockie(!value)}
              offLabel={t('off')}
              onLabel={t('on')}
            />
          </div>
        </div>
      </div>
    )
  }

  render () {
    const { warning } = this.props

    return (
      <div className="settings-page__body">
        { warning && <div className="settings-tab__error">{ warning }</div> }
        { this.renderCurrentLocale() }
        { this.renderTheme() }
        { this.renderBlockieOptIn() }
      </div>
    )
  }
}
