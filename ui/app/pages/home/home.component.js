import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import AssetList from '../../components/app/asset-list';
import BackupReminder from '../../components/app/backup-reminder';
import BuildStamp from '../../components/app/build-stamp';
import MenuBar from '../../components/app/menu-bar';
import NftList from '../../components/app/nft-list';
import TransactionList from '../../components/app/transaction-list';
import { EthOverview } from '../../components/app/wallet-overview';
import { Tabs, Tab } from '../../components/ui/tabs';
import {
  ASSET_ROUTE,
  RESTORE_VAULT_ROUTE,
  CONFIRM_TRANSACTION_ROUTE,
  CONFIRM_ADD_SUGGESTED_TOKEN_ROUTE,
  CONFIRM_NETWORK_REQUEST_ROUTE,
  CONNECT_ROUTE,
  CONNECTED_ROUTE,
  CONNECTED_ACCOUNTS_ROUTE,
} from '../../helpers/constants/routes';
import { toRelativeRoutePath } from '../../helpers/utils/routes.util';
import { closeNotificationWindow } from '../../store/actions';
import ConnectedAccounts from '../connected-accounts';
import ConnectedSites from '../connected-sites';

/**
 * Gets the route of the first pending request the home page should send the
 * user to, if any.
 *
 * @param {object} requests - The pending requests.
 * @param {string} [requests.firstPermissionsRequestId] - The id of the first
 * pending permissions request.
 * @param {number} [requests.unconfirmedTransactionsCount] - The number of
 * unconfirmed transactions and messages.
 * @param {object} [requests.suggestedTokens] - The pending suggested tokens.
 * @param {boolean} [requests.hasNetworkRequests] - Whether there are pending
 * network requests.
 * @returns {string|null} The route to redirect to, or null if none.
 */
function getRedirectRoute({
  firstPermissionsRequestId,
  unconfirmedTransactionsCount,
  suggestedTokens = {},
  hasNetworkRequests,
}) {
  if (firstPermissionsRequestId) {
    return `${CONNECT_ROUTE}/${firstPermissionsRequestId}`;
  } else if (unconfirmedTransactionsCount > 0) {
    return CONFIRM_TRANSACTION_ROUTE;
  } else if (Object.keys(suggestedTokens).length > 0) {
    return CONFIRM_ADD_SUGGESTED_TOKEN_ROUTE;
  } else if (hasNetworkRequests) {
    return CONFIRM_NETWORK_REQUEST_ROUTE;
  }
  return null;
}

export default class Home extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    navigate: PropTypes.func,
    forgottenPassword: PropTypes.bool,
    suggestedTokens: PropTypes.object,
    unconfirmedTransactionsCount: PropTypes.number,
    isNotification: PropTypes.bool.isRequired,
    firstPermissionsRequestId: PropTypes.string,
    hasNetworkRequests: PropTypes.bool,
    totalUnapprovedCount: PropTypes.number.isRequired,
    defaultHomeActiveTabName: PropTypes.string,
    useNftDetection: PropTypes.bool,
    onTabClick: PropTypes.func.isRequired,
  };

  state = {
    mounted: false,
  };

  componentDidMount() {
    const {
      firstPermissionsRequestId,
      hasNetworkRequests,
      navigate,
      isNotification,
      suggestedTokens,
      totalUnapprovedCount,
      unconfirmedTransactionsCount,
    } = this.props;

    this.setState({ mounted: true });
    const redirectRoute = getRedirectRoute({
      firstPermissionsRequestId,
      hasNetworkRequests,
      suggestedTokens,
      unconfirmedTransactionsCount,
    });
    if (isNotification && totalUnapprovedCount === 0) {
      closeNotificationWindow();
    } else if (redirectRoute) {
      navigate(redirectRoute);
    }
  }

  static getDerivedStateFromProps(props, state) {
    if (!state.mounted) {
      if (props.isNotification && props.totalUnapprovedCount === 0) {
        return { closing: true };
      } else if (getRedirectRoute(props)) {
        return { redirecting: true };
      }
    }
    return null;
  }

  componentDidUpdate(_, prevState) {
    if (!prevState.closing && this.state.closing) {
      closeNotificationWindow();
    }
  }

  render() {
    const { t } = this.context;
    const {
      defaultHomeActiveTabName,
      useNftDetection,
      onTabClick,
      forgottenPassword,
      navigate,
    } = this.props;

    if (forgottenPassword) {
      return <Navigate to={RESTORE_VAULT_ROUTE} replace />;
    } else if (this.state.closing || this.state.redirecting) {
      return null;
    }

    return (
      <div className="main-container">
        <Routes>
          <Route
            path={toRelativeRoutePath(CONNECTED_ROUTE)}
            element={<ConnectedSites />}
          />
          <Route
            path={toRelativeRoutePath(CONNECTED_ACCOUNTS_ROUTE)}
            element={<ConnectedAccounts />}
          />
          <Route path="*" element={null} />
        </Routes>
        <div className="home__container">
          <div className="home__main-view">
            <MenuBar />
            <div className="home__balance-wrapper">
              <EthOverview />
            </div>
            <Tabs
              defaultActiveTabName={defaultHomeActiveTabName}
              onTabClick={onTabClick}
              tabsClassName="home__tabs"
            >
              <Tab
                activeClassName="home__tab--active"
                className="home__tab"
                data-testid="home__asset-tab"
                name={t('assets')}
              >
                <AssetList
                  onClickAsset={(asset) => navigate(`${ASSET_ROUTE}/${asset}`)}
                />
                <BackupReminder />
              </Tab>
              <Tab
                activeClassName="home__tab--active"
                className="home__tab"
                data-testid="home__activity-tab"
                name={t('activity')}
              >
                <TransactionList />
              </Tab>
              {/* Only once the user has turned NFT detection on. */}
              {useNftDetection && (
                <Tab
                  activeClassName="home__tab--active"
                  className="home__tab"
                  data-testid="home__nfts-tab"
                  name={t('nfts')}
                >
                  <NftList />
                </Tab>
              )}
            </Tabs>
            <BuildStamp />
          </div>
        </div>
      </div>
    );
  }
}
