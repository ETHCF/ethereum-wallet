import { connect } from 'react-redux';
import { compose } from 'redux';

import Routes from './routes.component';
import { pageChanged } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import { hasPermissionRequests, getPreferences } from '../../selectors';
import {
  hideSidebar,
  setLastActiveTime,
  setMouseUserState,
} from '../../store/actions';

function mapStateToProps(state) {
  const { appState } = state;
  const { sidebar, alertOpen, alertMessage, isLoading, loadingMessage } =
    appState;
  const { autoLockTimeLimit = 0, theme } = getPreferences(state);

  return {
    sidebar,
    alertOpen,
    alertMessage,
    textDirection: state.ecfWallet.textDirection,
    isLoading,
    loadingMessage,
    isUnlocked: state.ecfWallet.isUnlocked,
    provider: state.ecfWallet.provider,
    frequentRpcListDetail: state.ecfWallet.frequentRpcListDetail || [],
    isMouseUser: state.appState.isMouseUser,
    autoLockTimeLimit,
    theme,
    hasPermissionsRequests: hasPermissionRequests(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    hideSidebar: () => dispatch(hideSidebar()),
    setMouseUserState: (isMouseUser) =>
      dispatch(setMouseUserState(isMouseUser)),
    setLastActiveTime: () => dispatch(setLastActiveTime()),
    pageChanged: (path) => dispatch(pageChanged(path)),
  };
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Routes);
