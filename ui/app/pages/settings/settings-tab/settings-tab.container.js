import { connect } from 'react-redux'
import {
  setCurrentCurrency,
  setUseBlockie,
  updateCurrentLocale,
} from '../../../store/actions'
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
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    setCurrentCurrency: (currency) => dispatch(setCurrentCurrency(currency)),
    setUseBlockie: (value) => dispatch(setUseBlockie(value)),
    updateCurrentLocale: (key) => dispatch(updateCurrentLocale(key)),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SettingsTab)
