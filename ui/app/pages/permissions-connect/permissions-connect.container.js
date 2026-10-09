import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import PermissionApproval from './permissions-connect.component';
import {
  CONNECT_ROUTE,
  CONNECT_CONFIRM_PERMISSIONS_ROUTE,
} from '../../helpers/constants/routes';
import withRouter from '../../helpers/higher-order-components/with-router';
import { formatDate } from '../../helpers/utils/util';
import {
  getPermissionsRequests,
  getNativeCurrency,
  getAccountsWithLabels,
  getLastConnectedInfo,
  getDomainMetadata,
  getSelectedAddress,
} from '../../selectors';
import {
  approvePermissionsRequest,
  rejectPermissionsRequest,
  showModal,
} from '../../store/actions';

const mapStateToProps = (state, ownProps) => {
  const {
    params: { id: permissionsRequestId },
    location: { pathname },
  } = ownProps;
  const permissionsRequests = getPermissionsRequests(state);
  const currentAddress = getSelectedAddress(state);

  const permissionsRequest = permissionsRequests.find(
    (req) => req.metadata.id === permissionsRequestId,
  );

  const { metadata = {} } = permissionsRequest || {};
  const { origin } = metadata;
  const nativeCurrency = getNativeCurrency(state);

  const domainMetadata = getDomainMetadata(state);

  let targetDomainMetadata = null;
  if (origin) {
    if (domainMetadata[origin]) {
      targetDomainMetadata = { ...domainMetadata[origin], origin };
    } else {
      const targetUrl = new URL(origin);
      targetDomainMetadata = {
        host: targetUrl.host,
        name: targetUrl.hostname,
        origin,
      };
    }
  }

  const accountsWithLabels = getAccountsWithLabels(state);

  const lastConnectedInfo = getLastConnectedInfo(state) || {};
  const addressLastConnectedMap = lastConnectedInfo[origin]?.accounts || {};

  Object.keys(addressLastConnectedMap).forEach((key) => {
    addressLastConnectedMap[key] = formatDate(
      addressLastConnectedMap[key],
      'yyyy-MM-dd',
    );
  });

  const connectPath = `${CONNECT_ROUTE}/${permissionsRequestId}`;
  const confirmPermissionPath = `${CONNECT_ROUTE}/${permissionsRequestId}${CONNECT_CONFIRM_PERMISSIONS_ROUTE}`;

  let page = '';
  if (pathname === connectPath) {
    page = '1';
  } else if (pathname === confirmPermissionPath) {
    page = '2';
  } else {
    throw new Error('Incorrect path for permissions-connect component');
  }

  return {
    permissionsRequest,
    permissionsRequestId,
    accounts: accountsWithLabels,
    currentAddress,
    origin,
    newAccountNumber: accountsWithLabels.length + 1,
    nativeCurrency,
    addressLastConnectedMap,
    lastConnectedInfo,
    connectPath,
    confirmPermissionPath,
    page,
    targetDomainMetadata,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    approvePermissionsRequest: (request, accounts) =>
      dispatch(approvePermissionsRequest(request, accounts)),
    rejectPermissionsRequest: (requestId) =>
      dispatch(rejectPermissionsRequest(requestId)),
    showNewAccountModal: ({ onCreateNewAccount, newAccountNumber }) => {
      return dispatch(
        showModal({
          name: 'NEW_ACCOUNT',
          onCreateNewAccount,
          newAccountNumber,
        }),
      );
    },
  };
};

const PermissionApprovalContainer = connect(
  mapStateToProps,
  mapDispatchToProps,
)(PermissionApproval);

PermissionApprovalContainer.propTypes = {
  navigate: PropTypes.func.isRequired,
  params: PropTypes.shape({
    id: PropTypes.string,
  }).isRequired,
};

export default withRouter(PermissionApprovalContainer);
