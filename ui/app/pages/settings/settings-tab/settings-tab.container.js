import { connect } from 'react-redux'
import {
  updateCurrentLocale,
  setThemePreference,
} from '../../../store/actions'
import { getPreferences } from '../../../selectors'
import SettingsTab from './settings-tab.component'

const mapStateToProps = (state) => {
  const { appState: { warning }, ecfWallet } = state
  const {
    currentLocale,
  } = ecfWallet

  return {
    warning,
    currentLocale,
    theme: getPreferences(state).theme,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    updateCurrentLocale: (key) => dispatch(updateCurrentLocale(key)),
    setThemePreference: (value) => dispatch(setThemePreference(value)),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SettingsTab)
