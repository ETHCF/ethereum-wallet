import { connect } from 'react-redux';

import SettingsTab from './settings-tab.component';
import { getPreferences } from '../../../selectors';
import {
  updateCurrentLocale,
  setThemePreference,
  setAutoLockTimeLimit,
} from '../../../store/actions';

const mapStateToProps = (state) => {
  const {
    appState: { warning },
    ecfWallet,
  } = state;
  const { currentLocale } = ecfWallet;
  const { theme, autoLockTimeLimit } = getPreferences(state);

  return {
    warning,
    currentLocale,
    theme,
    autoLockTimeLimit,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    updateCurrentLocale: (key) => dispatch(updateCurrentLocale(key)),
    setThemePreference: (value) => dispatch(setThemePreference(value)),
    setAutoLockTimeLimit: (value) => dispatch(setAutoLockTimeLimit(value)),
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(SettingsTab);
