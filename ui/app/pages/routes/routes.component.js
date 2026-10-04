import classnames from 'classnames'
import PropTypes from 'prop-types'
import React, { Component } from 'react'
import { matchPath, Route, Routes as RouterRoutes } from 'react-router-dom'
import IdleTimer from 'react-idle-timer'

import FirstTimeFlow from '../first-time-flow'
import SendTransactionScreen from '../send'
import ConfirmTransaction from '../confirm-transaction'
import Sidebar from '../../components/app/sidebars'
import Home from '../home'
import Settings from '../settings'
import Authenticated from '../../helpers/higher-order-components/authenticated'
import Initialized from '../../helpers/higher-order-components/initialized'
import Lock from '../lock'
import PermissionsConnect from '../permissions-connect'
import RestoreVaultPage from '../keychains/restore-vault'
import RevealSeedConfirmation from '../keychains/reveal-seed'
import AddTokenPage from '../add-token'
import ConfirmAddTokenPage from '../confirm-add-token'
import ConfirmAddSuggestedTokenPage from '../confirm-add-suggested-token'
import ConfirmNetworkRequest from '../confirm-network-request'
import CreateAccountPage from '../create-account'
import Loading from '../../components/ui/loading-screen'
import LoadingNetwork from '../../components/app/loading-network-screen'
import NetworkDropdown from '../../components/app/dropdowns/network-dropdown'
import AccountMenu from '../../components/app/account-menu'
import { Modal } from '../../components/app/modals'
import Alert from '../../components/ui/alert'
import AppHeader from '../../components/app/app-header'
import UnlockPage from '../unlock-page'
import Alerts from '../../components/app/alerts'
import Asset from '../asset'
import Help from '../help'
import TermsOfUse from '../terms-of-use'
import PrivacyPolicy from '../privacy-policy'

import {
  ADD_TOKEN_ROUTE,
  ASSET_ROUTE,
  CONFIRM_ADD_SUGGESTED_TOKEN_ROUTE,
  CONFIRM_NETWORK_REQUEST_ROUTE,
  CONFIRM_ADD_TOKEN_ROUTE,
  CONFIRM_TRANSACTION_ROUTE,
  CONNECT_ROUTE,
  DEFAULT_ROUTE,
  HELP_ROUTE,
  TERMS_OF_USE_ROUTE,
  PRIVACY_POLICY_ROUTE,
  INITIALIZE_ROUTE,
  INITIALIZE_UNLOCK_ROUTE,
  LOCK_ROUTE,
  NEW_ACCOUNT_ROUTE,
  RESTORE_VAULT_ROUTE,
  REVEAL_SEED_ROUTE,
  SEND_ROUTE,
  SETTINGS_ROUTE,
  UNLOCK_ROUTE,
} from '../../helpers/constants/routes'

import { ENVIRONMENT_TYPE_NOTIFICATION, ENVIRONMENT_TYPE_POPUP } from '../../../../app/scripts/lib/enums'
import { getEnvironmentType } from '../../../../app/scripts/lib/util'
import { getConnectingLabel, getNetworkDisplayName } from '../../helpers/utils/network-display'
import { applyTheme, onSystemThemeChange } from '../../helpers/utils/theme'

export default class Routes extends Component {
  static propTypes = {
    isLoading: PropTypes.bool,
    loadingMessage: PropTypes.string,
    alertMessage: PropTypes.string,
    textDirection: PropTypes.string,
    network: PropTypes.string,
    provider: PropTypes.object,
    frequentRpcListDetail: PropTypes.array,
    sidebar: PropTypes.object,
    alertOpen: PropTypes.bool,
    hideSidebar: PropTypes.func,
    isUnlocked: PropTypes.bool,
    setLastActiveTime: PropTypes.func,
    location: PropTypes.object,
    navigationType: PropTypes.string,
    lockEcfWallet: PropTypes.func,
    submittedPendingTransactions: PropTypes.array,
    isMouseUser: PropTypes.bool,
    setMouseUserState: PropTypes.func,
    providerId: PropTypes.string,
    hasPermissionsRequests: PropTypes.bool,
    autoLockTimeLimit: PropTypes.number,
    pageChanged: PropTypes.func.isRequired,
    theme: PropTypes.string,
  }

  static contextTypes = {
    t: PropTypes.func,
  }

  componentDidMount () {
    applyTheme(this.props.theme)
    // Follow the operating system when the theme preference is os
    this.removeSystemThemeListener = onSystemThemeChange(() => applyTheme(this.props.theme))
  }

  componentDidUpdate (prevProps) {
    const { location, navigationType, pageChanged, theme } = this.props
    if (prevProps.theme !== theme) {
      applyTheme(theme)
    }
    // Record the pages the user navigated to (not back or forward to).
    if (location.key !== prevProps.location.key && navigationType === 'PUSH') {
      pageChanged(location.pathname)
    }
  }

  componentWillUnmount () {
    this.removeSystemThemeListener()
  }

  renderRoutes () {
    const { autoLockTimeLimit, setLastActiveTime } = this.props

    const routes = (
      <RouterRoutes>
        <Route path={LOCK_ROUTE} element={<Lock />} />
        <Route path={`${INITIALIZE_ROUTE}/*`} element={<FirstTimeFlow />} />
        <Route path={`${HELP_ROUTE}/:topic?`} element={<Help />} />
        <Route path={TERMS_OF_USE_ROUTE} element={<TermsOfUse />} />
        <Route path={PRIVACY_POLICY_ROUTE} element={<PrivacyPolicy />} />
        <Route path={UNLOCK_ROUTE} element={<Initialized><UnlockPage /></Initialized>} />
        <Route path={RESTORE_VAULT_ROUTE} element={<Initialized><RestoreVaultPage /></Initialized>} />
        <Route path={REVEAL_SEED_ROUTE} element={<Authenticated><RevealSeedConfirmation /></Authenticated>} />
        <Route path={`${SETTINGS_ROUTE}/*`} element={<Authenticated><Settings /></Authenticated>} />
        <Route path={`${CONFIRM_TRANSACTION_ROUTE}/:id?/*`} element={<Authenticated><ConfirmTransaction /></Authenticated>} />
        <Route path={SEND_ROUTE} element={<Authenticated><SendTransactionScreen /></Authenticated>} />
        <Route path={ADD_TOKEN_ROUTE} element={<Authenticated><AddTokenPage /></Authenticated>} />
        <Route path={CONFIRM_ADD_TOKEN_ROUTE} element={<Authenticated><ConfirmAddTokenPage /></Authenticated>} />
        <Route path={CONFIRM_ADD_SUGGESTED_TOKEN_ROUTE} element={<Authenticated><ConfirmAddSuggestedTokenPage /></Authenticated>} />
        <Route path={CONFIRM_NETWORK_REQUEST_ROUTE} element={<Authenticated><ConfirmNetworkRequest /></Authenticated>} />
        <Route path={`${NEW_ACCOUNT_ROUTE}/*`} element={<Authenticated><CreateAccountPage /></Authenticated>} />
        <Route path={`${CONNECT_ROUTE}/:id/*`} element={<Authenticated><PermissionsConnect /></Authenticated>} />
        <Route path={`${ASSET_ROUTE}/:asset`} element={<Authenticated><Asset /></Authenticated>} />
        <Route path={`${DEFAULT_ROUTE}*`} element={<Authenticated><Home /></Authenticated>} />
      </RouterRoutes>
    )

    if (autoLockTimeLimit > 0) {
      return (
        <IdleTimer onAction={setLastActiveTime} throttle={1000}>
          {routes}
        </IdleTimer>
      )
    }

    return routes
  }

  onInitializationUnlockPage () {
    const { location } = this.props
    return Boolean(matchPath(INITIALIZE_UNLOCK_ROUTE, location.pathname))
  }

  onConfirmPage () {
    const { location } = this.props
    return Boolean(matchPath({ path: CONFIRM_TRANSACTION_ROUTE, end: false }, location.pathname))
  }

  hideAppHeader () {
    const { location, hasPermissionsRequests } = this.props

    const isInitializing = Boolean(matchPath({ path: INITIALIZE_ROUTE, end: false }, location.pathname))

    if (isInitializing && !this.onInitializationUnlockPage()) {
      return true
    }

    const windowType = getEnvironmentType()

    if (windowType === ENVIRONMENT_TYPE_NOTIFICATION) {
      return true
    }

    if (windowType === ENVIRONMENT_TYPE_POPUP && this.onConfirmPage()) {
      return true
    }

    const isHandlingPermissionsRequest = Boolean(matchPath({ path: CONNECT_ROUTE, end: false }, location.pathname)) || hasPermissionsRequests

    return isHandlingPermissionsRequest
  }

  render () {
    const {
      isLoading,
      isUnlocked,
      alertMessage,
      textDirection,
      loadingMessage,
      network,
      provider,
      frequentRpcListDetail,
      setMouseUserState,
      sidebar,
      submittedPendingTransactions,
      isMouseUser,
    } = this.props
    const isLoadingNetwork = network === 'loading'
    const loadMessage = (loadingMessage || isLoadingNetwork)
      ? this.getConnectingLabel(loadingMessage)
      : null

    const {
      isOpen: sidebarIsOpen,
      transitionName: sidebarTransitionName,
      type: sidebarType,
      props,
    } = sidebar
    const { transaction: sidebarTransaction } = props || {}

    const sidebarShouldClose = sidebarTransaction &&
      !sidebarTransaction.status === 'failed' &&
      !submittedPendingTransactions.find(({ id }) => id === sidebarTransaction.id)

    return (
      <div
        className={classnames('app', { 'mouse-user-styles': isMouseUser })}
        dir={textDirection}
        onClick={() => setMouseUserState(true)}
        onKeyDown={(e) => {
          if (e.keyCode === 9) {
            setMouseUserState(false)
          }
        }}
      >
        <Modal />
        <Alert
          visible={this.props.alertOpen}
          msg={alertMessage}
        />
        { !this.hideAppHeader() && (
          <AppHeader
            hideNetworkIndicator={this.onInitializationUnlockPage()}
            disabled={this.onConfirmPage()}
          />
        ) }
        <Sidebar
          sidebarOpen={sidebarIsOpen}
          sidebarShouldClose={sidebarShouldClose}
          hideSidebar={this.props.hideSidebar}
          transitionName={sidebarTransitionName}
          type={sidebarType}
          sidebarProps={sidebar.props}
        />
        <NetworkDropdown
          provider={provider}
          frequentRpcListDetail={frequentRpcListDetail}
        />
        <AccountMenu />
        <div className="main-container-wrapper">
          { isLoading && <Loading loadingMessage={loadMessage} /> }
          { !isLoading && isLoadingNetwork && <LoadingNetwork /> }
          { this.renderRoutes() }
        </div>
        {
          isUnlocked
            ? (
              <Alerts />
            )
            : null
        }
      </div>
    )
  }

  toggleEcfWalletActive () {
    if (this.props.isUnlocked) {
      // currently active: deactivate
      this.props.lockEcfWallet()
    } else {
      // currently inactive: redirect to password box
      const passwordBox = document.querySelector('input[type=password]')
      if (!passwordBox) {
        return
      }
      passwordBox.focus()
    }
  }

  getConnectingLabel (loadingMessage) {
    if (loadingMessage) {
      return loadingMessage
    }
    const { provider, providerId } = this.props
    return getConnectingLabel(provider, providerId, this.context.t)
  }

  getNetworkName () {
    return getNetworkDisplayName(this.props.provider, this.context.t)
  }
}
