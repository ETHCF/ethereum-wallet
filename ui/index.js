import copyToClipboard from 'copy-to-clipboard';
import { clone } from 'lodash';
import log from 'loglevel';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { ALERT_STATE } from './app/ducks/alerts/unconnected-account';
import {
  getUnconnectedAccountAlertEnabledness,
  getUnconnectedAccountAlertShown,
} from './app/ducks/ecf-wallet/ecf-wallet';
import { fetchLocale } from './app/helpers/utils/i18n-helper';
import switchDirection from './app/helpers/utils/switch-direction';
import { applyTheme } from './app/helpers/utils/theme';
import Root from './app/pages';
import {
  getPermittedAccountsForCurrentTab,
  getSelectedAddress,
  unconfirmedTransactionsListSelector,
} from './app/selectors';
import * as actions from './app/store/actions';
import configureStore from './app/store/store';
import { ALERT_TYPES } from '../app/scripts/controllers/alert';
import { ENVIRONMENT_TYPE_POPUP } from '../app/scripts/lib/enums';
import { getEnvironmentType } from '../app/scripts/lib/util';

log.setLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn');

export default function launchEcfWalletUi(opts, cb) {
  const { backgroundConnection } = opts;
  actions._setBackgroundConnection(backgroundConnection);
  // check if we are unlocked first
  backgroundConnection.getState(function (err, ecfWalletState) {
    if (err) {
      cb(err);
      return;
    }
    // eslint-disable-next-line promise/catch-or-return, promise/no-promise-in-callback -- launch reports through cb, as its callers expect; a catch would change how startApp errors surface
    startApp(ecfWalletState, backgroundConnection, opts).then((store) => {
      setupDebuggingHelpers(store);
      // eslint-disable-next-line promise/no-callback-in-promise -- see above
      cb(null, store);
      return undefined;
    });
  });
}

async function startApp(ecfWalletState, backgroundConnection, opts) {
  // parse opts
  if (!ecfWalletState.featureFlags) {
    ecfWalletState.featureFlags = {};
  }

  const currentLocaleMessages = ecfWalletState.currentLocale
    ? await fetchLocale(ecfWalletState.currentLocale)
    : {};
  const enLocaleMessages = await fetchLocale('en');

  if (ecfWalletState.textDirection === 'rtl') {
    await switchDirection('rtl');
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
  };

  if (getEnvironmentType() === ENVIRONMENT_TYPE_POPUP) {
    const { origin } = draftInitialState.activeTab;
    const permittedAccountsForCurrentTab =
      getPermittedAccountsForCurrentTab(draftInitialState);
    const selectedAddress = getSelectedAddress(draftInitialState);
    const unconnectedAccountAlertShownOrigins =
      getUnconnectedAccountAlertShown(draftInitialState);
    const unconnectedAccountAlertIsEnabled =
      getUnconnectedAccountAlertEnabledness(draftInitialState);

    if (
      origin &&
      unconnectedAccountAlertIsEnabled &&
      !unconnectedAccountAlertShownOrigins[origin] &&
      permittedAccountsForCurrentTab.length > 0 &&
      !permittedAccountsForCurrentTab.includes(selectedAddress)
    ) {
      draftInitialState[ALERT_TYPES.unconnectedAccount] = {
        state: ALERT_STATE.OPEN,
      };
      actions.setUnconnectedAccountAlertShown(origin);
    }
  }

  const store = configureStore(draftInitialState);
  applyTheme(ecfWalletState.preferences?.theme);

  // if unconfirmed txs, start on txConf page
  const [firstUnconfirmed] = unconfirmedTransactionsListSelector(
    store.getState(),
  );
  if (firstUnconfirmed) {
    store.dispatch(actions.showConfTxPage({ id: firstUnconfirmed.id }));
  }

  backgroundConnection.on('update', function (state) {
    store.dispatch(actions.updateEcfWalletState(state));
  });

  // global ecf-wallet api - used by tooling
  global.ecfWallet = {
    updateCurrentLocale: (code) => {
      store.dispatch(actions.updateCurrentLocale(code));
    },
    setProviderType: (type) => {
      store.dispatch(actions.setProviderType(type));
    },
    setFeatureFlag: (key, value) => {
      store.dispatch(actions.setFeatureFlag(key, value));
    },
  };

  // start app
  createRoot(opts.container).render(<Root store={store} />);

  return store;
}

/**
 * Adds `window.getCleanAppState`, which returns a copy of the app state with
 * the extension version and browser user agent added, for debugging.
 *
 * @param {object} store - The Redux store.
 */
function setupDebuggingHelpers(store) {
  window.getCleanAppState = function () {
    const state = clone(store.getState());
    state.version = global.platform.getVersion();
    state.browser = window.navigator.userAgent;
    return state;
  };
}

window.logStateString = function (cb) {
  const state = window.getCleanAppState();
  global.platform.getPlatformInfo((err, platform) => {
    if (err) {
      cb(err);
      return;
    }
    state.platform = platform;
    const stateString = JSON.stringify(state, null, 2);
    cb(null, stateString);
  });
};

window.logState = function (toClipboard) {
  return window.logStateString((err, result) => {
    if (err) {
      console.error(err.message);
    } else if (toClipboard) {
      copyToClipboard(result);
      console.log('State log copied');
    } else {
      console.log(result);
    }
  });
};
