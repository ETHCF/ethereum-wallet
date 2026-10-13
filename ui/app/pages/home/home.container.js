import { connect } from 'react-redux';
import { compose } from 'redux';

import Home from './home.component';
import { ENVIRONMENT_TYPE_NOTIFICATION } from '../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../app/scripts/lib/util';
import withRouter from '../../helpers/higher-order-components/with-router';
import {
  unconfirmedTransactionsCountSelector,
  getFirstPermissionRequest,
  getTotalUnapprovedCount,
  getNetworkRequests,
} from '../../selectors';
import { setDefaultHomeActiveTabName } from '../../store/actions';

const mapStateToProps = (state) => {
  const { ecfWallet, appState } = state;
  const { suggestedTokens, defaultHomeActiveTabName, useNftDetection } =
    ecfWallet;
  const { forgottenPassword } = appState;
  const totalUnapprovedCount = getTotalUnapprovedCount(state);

  const envType = getEnvironmentType();
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
    isNotification,
    firstPermissionsRequestId,
    hasNetworkRequests: getNetworkRequests(state).length > 0,
    totalUnapprovedCount,
    defaultHomeActiveTabName,
    useNftDetection: Boolean(useNftDetection),
  };
};

const mapDispatchToProps = (dispatch) => ({
  onTabClick: (name) => dispatch(setDefaultHomeActiveTabName(name)),
});

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Home);
