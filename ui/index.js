import copyToClipboard from 'copy-to-clipboard'
import log from 'loglevel'
import { clone } from 'lodash'
import React from 'react'
import { render } from 'react-dom'
import { getEnvironmentType } from '../app/scripts/lib/util'
import { ALERT_TYPES } from '../app/scripts/controllers/alert'
import { ENVIRONMENT_TYPE_POPUP } from '../app/scripts/lib/enums'
import Root from './app/pages'
import * as actions from './app/store/actions'
import configureStore from './app/store/store'
import { applyTheme } from './app/helpers/utils/theme'
import txHelper from './lib/tx-helper'
import { fetchLocale, loadRelativeTimeFormatLocaleData } from './app/helpers/utils/i18n-helper'
import switchDirection from './app/helpers/utils/switch-direction'
import { getPermittedAccountsForCurrentTab, getSelectedAddress } from './app/selectors'
import { ALERT_STATE } from './app/ducks/alerts/unconnected-account'
import {
  getUnconnectedAccountAlertEnabledness,
  getUnconnectedAccountAlertShown,
} from './app/ducks/ecf-wallet/ecf-wallet'

log.setLevel(global.ECF_WALLET_DEBUG ? 'debug' : 'warn')

export default function launchEcfWalletUi (opts, cb) {
  const { backgroundConnection } = opts
  actions._setBackgroundConnection(backgroundConnection)
  // check if we are unlocked first
  backgroundConnection.getState(function (err, ecfWalletState) {
    if (err) {
      cb(err)
      return
    }
    startApp(ecfWalletState, backgroundConnection, opts)
      .then((store) => {
        setupDebuggingHelpers(store)
        cb(null, store)
      })
  })
}

async function startApp (ecfWalletState, backgroundConnection, opts) {
  // parse opts
  if (!ecfWalletState.featureFlags) {
    ecfWalletState.featureFlags = {}
  }

  const currentLocaleMessages = ecfWalletState.currentLocale
    ? await fetchLocale(ecfWalletState.currentLocale)
    : {}
  const enLocaleMessages = await fetchLocale('en')

  await loadRelativeTimeFormatLocaleData('en')
  if (ecfWalletState.currentLocale) {
    await loadRelativeTimeFormatLocaleData(ecfWalletState.currentLocale)
  }

  if (ecfWalletState.textDirection === 'rtl') {
    await switchDirection('rtl')
  }

  const draftInitialState = {
    activeTab: opts.activeTab,

    // ecfWalletState represents the cross-tab state
    ecfWallet: ecfWalletState,

    // appState represents the current tab's popup state
    appState: {},

    localeMessages: {
      current: currentLocaleMessages,
      en: enLocaleMessages,
    },
  }

  if (getEnvironmentType() === ENVIRONMENT_TYPE_POPUP) {
    const { origin } = draftInitialState.activeTab
    const permittedAccountsForCurrentTab = getPermittedAccountsForCurrentTab(draftInitialState)
    const selectedAddress = getSelectedAddress(draftInitialState)
    const unconnectedAccountAlertShownOrigins = getUnconnectedAccountAlertShown(draftInitialState)
    const unconnectedAccountAlertIsEnabled = getUnconnectedAccountAlertEnabledness(draftInitialState)

    if (
      origin &&
      unconnectedAccountAlertIsEnabled &&
      !unconnectedAccountAlertShownOrigins[origin] &&
      permittedAccountsForCurrentTab.length > 0 &&
      !permittedAccountsForCurrentTab.includes(selectedAddress)
    ) {
      draftInitialState[ALERT_TYPES.unconnectedAccount] = { state: ALERT_STATE.OPEN }
      actions.setUnconnectedAccountAlertShown(origin)
    }
  }

  const store = configureStore(draftInitialState)
  applyTheme(ecfWalletState.preferences?.theme)

  // if unconfirmed txs, start on txConf page
  const unapprovedTxsAll = txHelper(
    ecfWalletState.unapprovedTxs,
    ecfWalletState.unapprovedMsgs,
    ecfWalletState.unapprovedPersonalMsgs,
    ecfWalletState.unapprovedDecryptMsgs,
    ecfWalletState.unapprovedEncryptionPublicKeyMsgs,
    ecfWalletState.unapprovedTypedMessages,
    ecfWalletState.network,
  )
  const numberOfUnapprivedTx = unapprovedTxsAll.length
  if (numberOfUnapprivedTx > 0) {
    store.dispatch(actions.showConfTxPage({
      id: unapprovedTxsAll[0].id,
    }))
  }

  backgroundConnection.on('update', function (state) {
    store.dispatch(actions.updateEcfWalletState(state))
  })

  // global ecf-wallet api - used by tooling
  global.ecfWallet = {
    updateCurrentLocale: (code) => {
      store.dispatch(actions.updateCurrentLocale(code))
    },
    setProviderType: (type) => {
      store.dispatch(actions.setProviderType(type))
    },
    setFeatureFlag: (key, value) => {
      store.dispatch(actions.setFeatureFlag(key, value))
    },
  }

  // start app
  render(
    <Root
      store={store}
    />,
    opts.container,
  )

  return store
}

/**
 * Return a "masked" copy of the given object.
 *
 * The returned object includes only the properties present in the mask. The
 * mask is an object that mirrors the structure of the given object, except
 * the only values are `true` or a sub-mask. `true` implies the property
 * should be included, and a sub-mask implies the property should be further
 * masked according to that sub-mask.
 *
 * @param {Object} object - The object to mask
 * @param {Object<Object|boolean>} mask - The mask to apply to the object
 */
function setupDebuggingHelpers (store) {
  window.getCleanAppState = function () {
    const state = clone(store.getState())
    state.version = global.platform.getVersion()
    state.browser = window.navigator.userAgent
    return state
  }
}

window.logStateString = function (cb) {
  const state = window.getCleanAppState()
  global.platform.getPlatformInfo((err, platform) => {
    if (err) {
      cb(err)
      return
    }
    state.platform = platform
    const stateString = JSON.stringify(state, null, 2)
    cb(null, stateString)
  })
}

window.logState = function (toClipboard) {
  return window.logStateString((err, result) => {
    if (err) {
      console.error(err.message)
    } else if (toClipboard) {
      copyToClipboard(result)
      console.log('State log copied')
    } else {
      console.log(result)
    }
  })
}
