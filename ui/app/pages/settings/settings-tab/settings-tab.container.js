import { connect } from 'react-redux';

import SettingsTab from './settings-tab.component';
import { getPreferences } from '../../../selectors';
import {
  updateCurrentLocale,
  setThemePreference,
} from '../../../store/actions';

const mapStateToProps = (state) => {
  const {
    appState: { warning },
    ecfWallet,
  } = state;
  const { currentLocale } = ecfWallet;

  return {
    warning,
    currentLocale,
    theme: getPreferences(state).theme,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    updateCurrentLocale: (key) => dispatch(updateCurrentLocale(key)),
    setThemePreference: (value) => dispatch(setThemePreference(value)),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(SettingsTab);
