import { connect } from 'react-redux';
import { compose } from 'redux';

import Home from './home.component';
import {
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_POPUP,
} from '../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../app/scripts/lib/util';
import withRouter from '../../helpers/higher-order-components/with-router';
import {
  unconfirmedTransactionsCountSelector,
  getFirstPermissionRequest,
  getTotalUnapprovedCount,
  getNetworkRequests,
} from '../../selectors';
import {
  setConnectedStatusPopoverHasBeenShown,
  setDefaultHomeActiveTabName,
} from '../../store/actions';

const mapStateToProps = (state) => {
  const { ecfWallet, appState } = state;
  const {
    suggestedTokens,
    connectedStatusPopoverHasBeenShown,
    defaultHomeActiveTabName,
  } = ecfWallet;
  const { forgottenPassword } = appState;
  const totalUnapprovedCount = getTotalUnapprovedCount(state);

  const envType = getEnvironmentType();
  const isPopup = envType === ENVIRONMENT_TYPE_POPUP;
  const isNotification = envType === ENVIRONMENT_TYPE_NOTIFICATION;

  const firstPermissionsRequest = getFirstPermissionRequest(state);
  const firstPermissionsRequestId =
    firstPermissionsRequest && firstPermissionsRequest.metadata
      ? firstPermissionsRequest.metadata.id
      : null;

  return {
    forgottenPassword,
    suggestedTokens,
    unconfirmedTransactionsCount: unconfirmedTransactionsCountSelector(state),
    isPopup,
    isNotification,
    firstPermissionsRequestId,
    hasNetworkRequests: getNetworkRequests(state).length > 0,
    totalUnapprovedCount,
    connectedStatusPopoverHasBeenShown,
    defaultHomeActiveTabName,
  };
};

const mapDispatchToProps = (dispatch) => ({
  setConnectedStatusPopoverHasBeenShown: () =>
    dispatch(setConnectedStatusPopoverHasBeenShown()),
  onTabClick: (name) => dispatch(setDefaultHomeActiveTabName(name)),
});

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Home);
