import { connect } from 'react-redux'
import {
  setCurrentCurrency,
  setUseBlockie,
  updateCurrentLocale,
  setThemePreference,
} from '../../../store/actions'
import { getPreferences } from '../../../selectors'
import SettingsTab from './settings-tab.component'

const mapStateToProps = (state) => {
  const { appState: { warning }, ecfWallet } = state
  const {
    currentCurrency,
    conversionDate,
    useBlockie,
    currentLocale,
  } = ecfWallet

  return {
    warning,
    currentLocale,
    currentCurrency,
    conversionDate,
    useBlockie,
    theme: getPreferences(state).theme,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    setCurrentCurrency: (currency) => dispatch(setCurrentCurrency(currency)),
    setUseBlockie: (value) => dispatch(setUseBlockie(value)),
    updateCurrentLocale: (key) => dispatch(updateCurrentLocale(key)),
    setThemePreference: (value) => dispatch(setThemePreference(value)),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SettingsTab)
