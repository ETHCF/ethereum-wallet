/**
 * @file The entry point for the web extension singleton process.
 */
// these need to run before anything else
/* eslint-disable import-x/order */
import './lib/freezeGlobals';
import setupFetchDebugging from './lib/setupFetchDebugging';

import { storeAsStream, storeTransformStream } from '@metamask/obs-store';
import endOfStream from 'end-of-stream';
import { ExtensionPortStream } from 'extension-port-stream';
import log from 'loglevel';
import pump from 'pump';

import ReadOnlyNetworkStore from './lib/network-store';
import createStreamSink from './lib/createStreamSink';
import NotificationManager from './lib/notification-manager';
import {
  PHISHING_CHECK,
  PHISHING_WARNING_CONTINUE,
} from './lib/phishing-warnings';
import EcfWalletController from './ecf-wallet-controller';
import { getAutoLockDeadline } from './lib/auto-lock';
import ClipboardCleaner from './lib/clipboard-cleaner';
import getFirstPreferredLangCode from './lib/get-first-preferred-lang-code';
import setupEnsIpfsResolver from './lib/ens-ipfs/setup';

import {
  ENVIRONMENT_TYPE_POPUP,
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_FULLSCREEN,
} from './lib/enums';
import extension from './lib/extension-api';
import { closeHardwareConnections } from './lib/hardware-keyrings';
import LocalStore from './lib/local-store';
import Migrator from './lib/migrator';
import readDisconnectError from './lib/read-disconnect-error';
import restoreSession from './lib/restore-session';
import SessionEncryptor from './lib/session-encryptor';
import connectLiveReload from './lib/worker-live-reload';
import migrations from './migrations';
import ExtensionPlatform from './platforms/extension';
/* eslint-enable import-x/order */

setupFetchDebugging();

if (process.env.ECF_WALLET_DEBUG) {
  connectLiveReload();
}

log.setDefaultLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn');

const platform = new ExtensionPlatform();
const notificationManager = new NotificationManager();

let popupIsOpen = false;
let notificationIsOpen = false;
const openEcfWalletTabsIDs = {};
const clipboardCleaner = new ClipboardCleaner({ extension });

// state persistence
const inTest = process.env.IN_TEST === 'true';
const localStore = inTest ? new ReadOnlyNetworkStore() : new LocalStore();
let versionedData;

if (inTest || process.env.ECF_WALLET_DEBUG) {
  global.ecfWalletGetState = localStore.get.bind(localStore);
}

// Register wake-up events before loading persisted state. ExtensionPortStream buffers
// messages arriving while the controller is being restored.
const initialized = initialize();
initialized.catch(log.error);
extension.runtime.onConnect.addListener((port) =>
  queueConnection(port, 'connectRemote'),
);
extension.runtime.onConnectExternal.addListener((port) =>
  queueConnection(port, 'connectExternal'),
);
extension.webRequest.onErrorOccurred.addListener(
  (details) => {
    initialized
      .then(({ ensResolver }) => ensResolver.handleRequest(details))
      .catch(log.error);
  },
  { urls: ['*://*.eth/*'], types: ['main_frame'] },
);
platform._subscribeToNotificationClicked();
extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'ecf-wallet-ui-active' && isOwnExtensionPage(sender)) {
    respond(true);
  } else if (
    message?.type === PHISHING_CHECK &&
    sender.id === extension.runtime.id &&
    sender.tab &&
    sender.url &&
    !isOwnExtensionPage(sender)
  ) {
    // A content script whose page did not get the provider. Only the
    // browser-reported sender is used, so a page can ask only about itself.
    initialized
      .then(({ controller }) => controller.checkForPhishing(sender))
      .catch(log.error);
  }
});
extension.alarms.onAlarm.addListener((alarm) => {
  // Clipboard cleanup must not wait for wallet state to load.
  const clearing = clipboardCleaner.handleAlarm(alarm);
  if (clearing) {
    clearing.catch(log.error);
  }
  initialized
    .then(async ({ controller }) => {
      if (alarm.name === 'ecf-wallet-auto-lock') {
        if (isAutoLockDue(controller.appStateController.store.getState())) {
          await controller.setLocked();
        }
      } else if (alarm.name === 'ecf-wallet-pending-transactions') {
        await controller.txController.pendingTxTracker.updatePendingTxs();
      }
      return undefined;
    })
    .catch(log.error);
});

/**
 * Whether a sender is a page of this extension, such as the wallet UI, rather
 * than another extension or one of this extension's content scripts.
 *
 * @param {object} [sender] - The runtime.MessageSender, as the browser reported it.
 * @returns {boolean} Whether the sender is one of this extension's pages.
 */
function isOwnExtensionPage(sender) {
  return Boolean(
    sender?.id === extension.runtime.id &&
    sender.url?.startsWith(extension.runtime.getURL('')),
  );
}

/**
 * Whether the auto-lock deadline has passed.
 *
 * @param {object} appState - The AppStateController state.
 * @returns {boolean} Whether the wallet should be locked.
 */
function isAutoLockDue(appState) {
  const deadline = getAutoLockDeadline(appState);
  return Boolean(deadline) && deadline <= Date.now();
}

function queueConnection(port, handler) {
  // A dapp tab entering the back/forward cache closes its port, and the
  // background end receives that as a disconnect error.
  port.onDisconnect.addListener(() => readDisconnectError(port));
  if (port.name === 'trezor-connect') {
    return;
  }
  const stream = new ExtensionPortStream(port);
  let disconnected = false;
  port.onDisconnect.addListener(() => {
    disconnected = true;
  });
  initialized
    .then((handlers) => {
      if (!disconnected) {
        handlers[handler](port, stream);
      }
      return undefined;
    })
    .catch((error) => {
      log.error(error);
      stream.destroy();
      port.disconnect();
    });
}

/**
 * An object representing a transaction, in whatever state it is in.
 *
 * @typedef TransactionMeta
 *
 * @property {number} id - An internally unique tx identifier.
 * @property {number} time - Time the tx was first suggested, in unix epoch time (ms).
 * @property {string} status - The current transaction status (unapproved, signed, submitted, dropped, failed, rejected), as defined in `tx-state-manager.js`.
 * @property {string} ecfWalletNetworkId - The transaction's network ID, used for EIP-155 compliance.
 * @property {boolean} loadingDefaults - Whether the tx's gas defaults are still being calculated; the UI waits until this is false.
 * @property {object} txParams - The tx params as passed to the network provider.
 * @property {object[]} history - A history of mutations to this TransactionMeta object.
 * @property {string} origin - A string representing the interface that suggested the transaction.
 * @property {object} nonceDetails - A metadata object containing information used to derive the suggested nonce, useful for debugging nonce issues.
 * @property {string} rawTx - A hex string of the final signed transaction, ready to submit to the network.
 * @property {string} hash - A hex string of the transaction hash, used to identify the transaction on the network.
 * @property {number} submittedTime - The time the transaction was submitted to the network, in Unix epoch time (ms).
 */

/**
 * The data emitted from the EcfWalletController.store EventEmitter, also used to initialize the EcfWalletController. Available in UI on React state as state.ecfWallet.
 *
 * @typedef EcfWalletState
 * @property {boolean} isInitialized - Whether the first vault has been created.
 * @property {boolean} isUnlocked - Whether the vault is currently decrypted and accounts are available for selection.
 * @property {object} identities - An object matching lower-case hex addresses to Identity objects with "address" and "name" (nickname) keys.
 * @property {object} unapprovedTxs - An object mapping transaction hashes to unapproved transactions.
 * @property {Array} frequentRpcList - A list of frequently used RPCs, including custom user-provided ones.
 * @property {Array} addressBook - A list of previously sent to addresses.
 * @property {Array} tokens - Tokens held by the current user, including their balances.
 * @property {object} send - The draft transaction on the Send screen (recipient, amount, gas, errors and the ID of any transaction being edited). This is UI-only state kept in Redux, not persisted by the controller.
 * @property {object} featureFlags - An object for optional feature flags.
 * @property {string} currentLocale - A locale string matching the user's preferred display language.
 * @property {object} provider - The current selected network provider.
 * @property {string} provider.rpcTarget - The address for the RPC API, if using an RPC API.
 * @property {string} provider.type - An identifier for the type of network selected, allows ecf-wallet to use custom provider strategies for known networks.
 * @property {string} network - A stringified number of the current network ID.
 * @property {object} accounts - An object mapping lower-case hex addresses to objects with "balance" and "address" keys, both storing hex string values.
 * @property {string} currentBlockGasLimit - The most recently seen block gas limit, in a lower case hex prefixed string.
 * @property {TransactionMeta[]} currentNetworkTxList - An array of transactions associated with the currently selected network.
 * @property {object} unapprovedPersonalMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedPersonalMsgCount - The number of messages in unapprovedPersonalMsgs.
 * @property {object} unapprovedEncryptionPublicKeyMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedEncryptionPublicKeyMsgCount - The number of messages in EncryptionPublicKeyMsgs.
 * @property {object} unapprovedDecryptMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedDecryptMsgCount - The number of messages in unapprovedDecryptMsgs.
 * @property {object} unapprovedTypedMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedTypedMsgCount - The number of messages in unapprovedTypedMsgs.
 * @property {string[]} keyringTypes - An array of unique keyring identifying strings, representing available strategies for creating accounts.
 * @property {object[]} keyrings - An array of keyring descriptions, summarizing the accounts that are available for use, and what keyrings they belong to.
 * @property {string} selectedAddress - A lower case hex string of the currently selected address.
 */

/**
 * @typedef VersionedData
 * @property {EcfWalletState} data - The data emitted from ecf-wallet controller, or used to initialize it.
 * @property {number} version - The latest migration version that has been run.
 */

/**
 * Initializes the ecf-wallet controller, and sets up all platform configuration.
 *
 * @returns {Promise} Setup complete.
 */
async function initialize() {
  const initState = await loadStateFromPersistence();
  const initLangCode = await getFirstPreferredLangCode();
  const handlers = await setupController(initState, initLangCode);
  log.debug('ecf-wallet initialization complete.');
  return handlers;
}

//
// State and Persistence
//

/**
 * Loads any stored data, prioritizing the latest storage strategy.
 * Migrates that data schema in case it was last loaded on an older version.
 *
 * @returns {Promise<EcfWalletState>} Last data emitted from previous instance of ecf-wallet.
 */
async function loadStateFromPersistence() {
  // migrations
  const migrator = new Migrator({ migrations });
  migrator.on('error', console.warn);

  // read from disk
  // first from preferred, async API:
  versionedData = (await localStore.get()) || migrator.generateInitialState({});

  // check if somehow state is empty
  // this should never happen but new error reporting suggests that it has
  // for a small number of users
  if (versionedData && !versionedData.data) {
    // unable to recover, clear state
    versionedData = migrator.generateInitialState({});
    console.error('ecf-wallet - Empty vault found - unable to recover');
  }

  // migrate data
  versionedData = await migrator.migrateData(versionedData);
  if (!versionedData) {
    throw new Error('ecf-wallet - migrator returned undefined');
  }

  // write to disk
  if (localStore.isSupported) {
    await localStore.set(versionedData);
  } else {
    // throw in setTimeout so as to not block boot
    setTimeout(() => {
      throw new Error('ecf-wallet - Localstore not supported');
    });
  }

  // return just the data
  return versionedData.data;
}

/**
 * Initializes the ecf-wallet Controller with any initial state and default language.
 * Configures platform-specific error reporting strategy.
 * Streams emitted state updates to platform-specific storage strategy.
 * Creates platform listeners for new Dapps/Contexts, and sets up their data connections to the controller.
 *
 * @param {object} initState - The initial state to start the controller with, matches the state that is emitted from the controller.
 * @param {string} initLangCode - The region code for the language preferred by the current user.
 * @returns {Promise} After setup is complete.
 */
async function setupController(initState, initLangCode) {
  //
  // ecf-wallet Controller
  //

  const encryptor = new SessionEncryptor(extension.storage.session);
  const controller = new EcfWalletController({
    encryptor,
    // User confirmation callbacks:
    showUnconfirmedMessage: triggerUi,
    showUnapprovedTx: triggerUi,
    showPermissionRequest: triggerUi,
    showUnlockRequest: triggerUi,
    openPopup,
    clipboardCleaner,
    // initial state
    initState,
    // initial locale code
    initLangCode,
    // platform specific api
    platform,
    getOpenEcfWalletTabsIds: () => {
      return openEcfWalletTabsIDs;
    },
  });

  controller.keyringController.on('lock', () => {
    encryptor.clear().catch(log.error);
    closeHardwareConnections().catch(log.error);
  });
  controller.keyringController.memStore.subscribe(({ isUnlocked }) => {
    if (isUnlocked) {
      encryptor.save().catch(log.error);
    }
  });
  controller.keyringController.store.subscribe(() => {
    if (controller.isUnlocked()) {
      encryptor.save().catch(log.error);
    }
  });

  await restoreSession({
    encryptor,
    keyringController: controller.keyringController,
    sessionExpired: isAutoLockDue(
      controller.appStateController.store.getState(),
    ),
  });

  let lastDeadline;
  const scheduleAutoLock = (appState) => {
    const deadline = getAutoLockDeadline(appState);
    if (deadline === lastDeadline) {
      return;
    }
    lastDeadline = deadline;
    if (deadline) {
      extension.alarms.create('ecf-wallet-auto-lock', { when: deadline });
    } else {
      extension.alarms.clear('ecf-wallet-auto-lock');
    }
  };
  controller.appStateController.store.subscribe(scheduleAutoLock);
  scheduleAutoLock(controller.appStateController.store.getState());

  let hasPendingTransactions;
  const scheduleTransactions = () => {
    const pending =
      controller.txController.txStateManager.getFilteredTxList({
        status: 'submitted',
      }).length > 0;
    if (pending === hasPendingTransactions) {
      return;
    }
    hasPendingTransactions = pending;
    if (pending) {
      extension.alarms.create('ecf-wallet-pending-transactions', {
        periodInMinutes: 1,
      });
    } else {
      extension.alarms.clear('ecf-wallet-pending-transactions');
    }
  };
  controller.txController.txStateManager.store.subscribe(scheduleTransactions);
  scheduleTransactions();

  const ensResolver = setupEnsIpfsResolver({
    getCurrentNetwork: controller.getCurrentNetwork,
    getIpfsGateway: controller.preferencesController.getIpfsGateway.bind(
      controller.preferencesController,
    ),
    provider: controller.provider,
  });

  // setup state persistence
  pump(
    storeAsStream(controller.store),
    storeTransformStream(versionifyData),
    createStreamSink(persistData),
    (error) => {
      log.error('ecf-wallet - Persistence pipeline failed', error);
    },
  );

  /**
   * Assigns the given state to the versioned object (with metadata), and returns that.
   *
   * @param {object} state - The state object as emitted by the EcfWalletController.
   * @returns {VersionedData} The state object wrapped in an object that includes a metadata key.
   */
  function versionifyData(state) {
    return { ...versionedData, data: state };
  }

  async function persistData(state) {
    if (!state) {
      throw new Error('ecf-wallet - updated state is missing');
    }
    if (!state.data) {
      throw new Error('ecf-wallet - updated state does not have data');
    }
    if (localStore.isSupported) {
      try {
        await localStore.set(state);
      } catch (err) {
        // log error so we dont break the pipeline
        log.error('error setting state in local store:', err);
      }
    }
  }

  //
  // connect to other contexts
  //
  const ecfWalletInternalProcessHash = {
    [ENVIRONMENT_TYPE_POPUP]: true,
    [ENVIRONMENT_TYPE_NOTIFICATION]: true,
    [ENVIRONMENT_TYPE_FULLSCREEN]: true,
  };

  /**
   * A runtime.Port object, as provided by the browser:
   *
   * @see https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/runtime/Port
   * @typedef {object} Port
   * @property {string} name - The name given to the port when it was opened.
   * @property {object} [sender] - The sender of the connection, such as its extension ID, tab and URL.
   */

  /**
   * Connects a Port to the ecf-wallet controller via a multiplexed duplex stream.
   * This method identifies trusted (ecf-wallet) interfaces, and connects them differently from untrusted (web pages).
   *
   * @param {Port} remotePort - The port provided by a new context.
   * @param {ExtensionPortStream} portStream - The stream wrapping `remotePort`.
   */
  function connectRemote(remotePort, portStream) {
    const processName = remotePort.name;
    const isEcfWalletInternalProcess =
      ecfWalletInternalProcessHash[processName] &&
      isOwnExtensionPage(remotePort.sender);

    if (processName === PHISHING_WARNING_CONTINUE) {
      const { sender } = remotePort;
      const isWarningPage =
        isOwnExtensionPage(sender) &&
        sender.frameId === 0 &&
        sender.tab &&
        new URL(sender.url).pathname === '/phishing.html';
      if (isWarningPage) {
        controller
          .continueFromPhishingWarning(sender.tab.id)
          .catch((error) => log.error('ecf-wallet - unable to continue', error))
          .finally(() => remotePort.disconnect());
      }
      return;
    }

    if (isEcfWalletInternalProcess) {
      // communication with popup
      controller.setupTrustedCommunication(portStream, remotePort.sender);

      if (processName === ENVIRONMENT_TYPE_POPUP) {
        popupIsOpen = true;

        endOfStream(portStream, () => {
          popupIsOpen = false;
        });
      }

      if (processName === ENVIRONMENT_TYPE_NOTIFICATION) {
        notificationIsOpen = true;

        endOfStream(portStream, () => {
          notificationIsOpen = false;
        });
      }

      if (processName === ENVIRONMENT_TYPE_FULLSCREEN) {
        const tabId = remotePort.sender.tab.id;
        openEcfWalletTabsIDs[tabId] = true;

        endOfStream(portStream, () => {
          delete openEcfWalletTabsIDs[tabId];
        });
      }
    } else {
      connectExternal(remotePort, portStream);
    }
  }

  // communication with page or other extension
  function connectExternal(remotePort, portStream) {
    controller.setupUntrustedCommunication(portStream, remotePort.sender);
  }

  //
  // User Interface setup
  //

  updateBadge();
  controller.txController.on('update:badge', updateBadge);
  controller.personalMessageManager.on('updateBadge', updateBadge);
  controller.decryptMessageManager.on('updateBadge', updateBadge);
  controller.encryptionPublicKeyManager.on('updateBadge', updateBadge);
  controller.typedMessageManager.on('updateBadge', updateBadge);
  controller.permissionsController.approvals.store.subscribe(updateBadge);
  controller.appStateController.on('updateBadge', updateBadge);

  /**
   * Updates the Web Extension's "badge" number, on the little fox in the toolbar.
   * The number reflects the current number of pending transactions or message signatures needing user approval.
   */
  function updateBadge() {
    let label = '';
    const unapprovedTxCount = controller.txController.getUnapprovedTxCount();
    const { unapprovedPersonalMsgCount } = controller.personalMessageManager;
    const { unapprovedDecryptMsgCount } = controller.decryptMessageManager;
    const { unapprovedEncryptionPublicKeyMsgCount } =
      controller.encryptionPublicKeyManager;
    const { unapprovedTypedMessagesCount } = controller.typedMessageManager;
    const pendingPermissionRequests =
      controller.permissionsController.approvals.store.getState()
        .permissionsRequests.length;
    const waitingForUnlockCount =
      controller.appStateController.waitingForUnlock.length;
    const count =
      unapprovedTxCount +
      unapprovedPersonalMsgCount +
      unapprovedDecryptMsgCount +
      unapprovedEncryptionPublicKeyMsgCount +
      unapprovedTypedMessagesCount +
      pendingPermissionRequests +
      waitingForUnlockCount;
    if (count) {
      label = String(count);
    }
    extension.action.setBadgeText({ text: label });
    extension.action.setBadgeBackgroundColor({ color: '#037DD6' });
  }

  return { connectRemote, connectExternal, ensResolver, controller };
}

//
// Etc...
//

/**
 * Opens the browser popup for user confirmation
 */
async function triggerUi() {
  // A selected wallet tab in a background window must not suppress approval UI.
  const tabs = await platform.getActiveTabsInLastFocusedWindow();
  const currentlyActiveEcfWalletTab = Boolean(
    tabs.find((tab) => openEcfWalletTabsIDs[tab.id]),
  );
  if (!popupIsOpen && !currentlyActiveEcfWalletTab) {
    await notificationManager.showPopup();
  }
}

/**
 * Opens the browser popup for user confirmation of watchAsset
 * then it waits until user interact with the UI
 */
async function openPopup() {
  await triggerUi();
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!notificationIsOpen) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}

// On first install, open a new tab with ecf-wallet
extension.runtime.onInstalled.addListener(({ reason }) => {
  if (
    reason === 'install' &&
    !(process.env.ECF_WALLET_DEBUG || process.env.IN_TEST)
  ) {
    platform.openExtensionInBrowser();
  }
});
