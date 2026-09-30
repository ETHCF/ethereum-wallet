/**
 * @file The entry point for the web extension singleton process.
 */
// these need to run before anything else
/* eslint-disable import/first,import/order */
import './lib/freezeGlobals'
import setupFetchDebugging from './lib/setupFetchDebugging'
/* eslint-enable import/order */

setupFetchDebugging()

// polyfills
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch'

import endOfStream from 'end-of-stream'
import pump from 'pump'
import log from 'loglevel'
import storeTransform from 'obs-store/lib/transform'
import asStream from 'obs-store/lib/asStream'
import PortStream from 'extension-port-stream'
import { closeHardwareConnections } from './lib/hardware-keyrings'
import extension from './lib/extension-api'
import migrations from './migrations'
import Migrator from './lib/migrator'
import ExtensionPlatform from './platforms/extension'
import LocalStore from './lib/local-store'
import SessionEncryptor from './lib/session-encryptor'
import ReadOnlyNetworkStore from './lib/network-store'
import createStreamSink from './lib/createStreamSink'
import NotificationManager from './lib/notification-manager'
import EcfWalletController from './ecf-wallet-controller'
import rawFirstTimeState from './first-time-state'
import getFirstPreferredLangCode from './lib/get-first-preferred-lang-code'
import setupEnsIpfsResolver from './lib/ens-ipfs/setup'
import connectLiveReload from './lib/worker-live-reload'

import {
  ENVIRONMENT_TYPE_POPUP,
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_FULLSCREEN,
} from './lib/enums'
/* eslint-enable import/first */

if (process.env.IN_TEST === 'true') {
  // eslint-disable-next-line global-require
  require('../../development/mock-fetch')()
}
if (process.env.ECF_WALLET_DEBUG) {
  connectLiveReload()
}

// ECF_WALLET_TEST_CONFIG is used in e2e tests to set the default network to localhost
const firstTimeState = { ...rawFirstTimeState, ...global.ECF_WALLET_TEST_CONFIG }

log.setDefaultLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn')

const platform = new ExtensionPlatform()
const notificationManager = new NotificationManager()
global.ECF_WALLET_NOTIFIER = notificationManager

let popupIsOpen = false
let notificationIsOpen = false
const openEcfWalletTabsIDs = {}
const requestAccountTabIds = {}

// state persistence
const inTest = process.env.IN_TEST === 'true'
const localStore = inTest
  ? new ReadOnlyNetworkStore()
  : new LocalStore()
let versionedData

if (inTest || process.env.ECF_WALLET_DEBUG) {
  global.ecfWalletGetState = localStore.get.bind(localStore)
}

// Register wake-up events before loading persisted state. PortStream buffers
// messages arriving while the controller is being restored.
const initialized = initialize()
initialized.catch(log.error)
extension.runtime.onConnect.addListener((port) => queueConnection(port, 'connectRemote'))
extension.runtime.onConnectExternal.addListener((port) => queueConnection(port, 'connectExternal'))
extension.webRequest.onErrorOccurred.addListener((details) => {
  initialized.then(({ ensResolver }) => ensResolver.handleRequest(details)).catch(log.error)
}, { urls: ['*://*.eth/*'], types: ['main_frame'] })
platform._subscribeToNotificationClicked()
extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'ecf-wallet-ui-active' && sender.id === extension.runtime.id &&
      sender.url?.startsWith(extension.runtime.getURL(''))) {
    respond(true)
  }
})
extension.alarms.onAlarm.addListener((alarm) => {
  initialized.then(async ({ controller }) => {
    if (alarm.name === 'ecf-wallet-auto-lock') {
      const { timeoutMinutes, lastActiveTime } = controller.appStateController.store.getState()
      if (timeoutMinutes && lastActiveTime + (timeoutMinutes * 60000) <= Date.now()) {
        await controller.setLocked()
      }
    } else if (alarm.name === 'ecf-wallet-pending-transactions') {
      await controller.txController.pendingTxTracker.updatePendingTxs()
    }
  }).catch(log.error)
})

function queueConnection (port, handler) {
  if (port.name === 'trezor-connect') {
    return
  }
  const stream = new PortStream(port)
  let disconnected = false
  port.onDisconnect.addListener(() => {
    disconnected = true
  })
  initialized.then((handlers) => {
    if (!disconnected) {
      handlers[handler](port, stream)
    }
  }).catch((error) => {
    log.error(error)
    stream.destroy()
    port.disconnect()
  })
}

/**
 * An object representing a transaction, in whatever state it is in.
 * @typedef TransactionMeta
 *
 * @property {number} id - An internally unique tx identifier.
 * @property {number} time - Time the tx was first suggested, in unix epoch time (ms).
 * @property {string} status - The current transaction status (unapproved, signed, submitted, dropped, failed, rejected), as defined in `tx-state-manager.js`.
 * @property {string} ecfWalletNetworkId - The transaction's network ID, used for EIP-155 compliance.
 * @property {boolean} loadingDefaults - TODO: Document
 * @property {Object} txParams - The tx params as passed to the network provider.
 * @property {Object[]} history - A history of mutations to this TransactionMeta object.
 * @property {string} origin - A string representing the interface that suggested the transaction.
 * @property {Object} nonceDetails - A metadata object containing information used to derive the suggested nonce, useful for debugging nonce issues.
 * @property {string} rawTx - A hex string of the final signed transaction, ready to submit to the network.
 * @property {string} hash - A hex string of the transaction hash, used to identify the transaction on the network.
 * @property {number} submittedTime - The time the transaction was submitted to the network, in Unix epoch time (ms).
 */

/**
 * The data emitted from the EcfWalletController.store EventEmitter, also used to initialize the EcfWalletController. Available in UI on React state as state.ecfWallet.
 * @typedef EcfWalletState
 * @property {boolean} isInitialized - Whether the first vault has been created.
 * @property {boolean} isUnlocked - Whether the vault is currently decrypted and accounts are available for selection.
 * @property {boolean} isAccountMenuOpen - Represents whether the main account selection UI is currently displayed.
 * @property {string} rpcTarget - DEPRECATED - The URL of the current RPC provider.
 * @property {Object} identities - An object matching lower-case hex addresses to Identity objects with "address" and "name" (nickname) keys.
 * @property {Object} unapprovedTxs - An object mapping transaction hashes to unapproved transactions.
 * @property {Array} frequentRpcList - A list of frequently used RPCs, including custom user-provided ones.
 * @property {Array} addressBook - A list of previously sent to addresses.
 * @property {Object} contractExchangeRates - Info about current token prices.
 * @property {Array} tokens - Tokens held by the current user, including their balances.
 * @property {Object} send - TODO: Document
 * @property {boolean} useBlockie - Indicates preferred user identicon format. True for blockie, false for Jazzicon.
 * @property {Object} featureFlags - An object for optional feature flags.
 * @property {boolean} welcomeScreen - True if welcome screen should be shown.
 * @property {string} currentLocale - A locale string matching the user's preferred display language.
 * @property {Object} provider - The current selected network provider.
 * @property {string} provider.rpcTarget - The address for the RPC API, if using an RPC API.
 * @property {string} provider.type - An identifier for the type of network selected, allows ecf-wallet to use custom provider strategies for known networks.
 * @property {string} network - A stringified number of the current network ID.
 * @property {Object} accounts - An object mapping lower-case hex addresses to objects with "balance" and "address" keys, both storing hex string values.
 * @property {hex} currentBlockGasLimit - The most recently seen block gas limit, in a lower case hex prefixed string.
 * @property {TransactionMeta[]} currentNetworkTxList - An array of transactions associated with the currently selected network.
 * @property {Object} unapprovedMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedMsgCount - The number of messages in unapprovedMsgs.
 * @property {Object} unapprovedPersonalMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedPersonalMsgCount - The number of messages in unapprovedPersonalMsgs.
 * @property {Object} unapprovedEncryptionPublicKeyMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedEncryptionPublicKeyMsgCount - The number of messages in EncryptionPublicKeyMsgs.
 * @property {Object} unapprovedDecryptMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedDecryptMsgCount - The number of messages in unapprovedDecryptMsgs.
 * @property {Object} unapprovedTypedMsgs - An object of messages pending approval, mapping a unique ID to the options.
 * @property {number} unapprovedTypedMsgCount - The number of messages in unapprovedTypedMsgs.
 * @property {string[]} keyringTypes - An array of unique keyring identifying strings, representing available strategies for creating accounts.
 * @property {Keyring[]} keyrings - An array of keyring descriptions, summarizing the accounts that are available for use, and what keyrings they belong to.
 * @property {string} selectedAddress - A lower case hex string of the currently selected address.
 * @property {string} currentCurrency - A string identifying the user's preferred display currency, for use in showing conversion rates.
 * @property {number} conversionRate - A number representing the current exchange rate from the user's preferred currency to Ether.
 * @property {number} conversionDate - A unix epoch date (ms) for the time the current conversion rate was last retrieved.
 * @property {boolean} forgottenPassword - Returns true if the user has initiated the password recovery screen, is recovering from seed phrase.
 */

/**
 * @typedef VersionedData
 * @property {EcfWalletState} data - The data emitted from ecf-wallet controller, or used to initialize it.
 * @property {Number} version - The latest migration version that has been run.
 */

/**
 * Initializes the ecf-wallet controller, and sets up all platform configuration.
 * @returns {Promise} - Setup complete.
 */
async function initialize () {
  const initState = await loadStateFromPersistence()
  const initLangCode = await getFirstPreferredLangCode()
  const handlers = await setupController(initState, initLangCode)
  log.debug('ecf-wallet initialization complete.')
  return handlers
}

//
// State and Persistence
//

/**
 * Loads any stored data, prioritizing the latest storage strategy.
 * Migrates that data schema in case it was last loaded on an older version.
 * @returns {Promise<EcfWalletState>} - Last data emitted from previous instance of ecf-wallet.
 */
async function loadStateFromPersistence () {
  // migrations
  const migrator = new Migrator({ migrations })
  migrator.on('error', console.warn)

  // read from disk
  // first from preferred, async API:
  versionedData = (await localStore.get()) ||
                  migrator.generateInitialState(firstTimeState)

  // check if somehow state is empty
  // this should never happen but new error reporting suggests that it has
  // for a small number of users
  // https://github.com/metamask/metamask-extension/issues/3919
  if (versionedData && !versionedData.data) {
    // unable to recover, clear state
    versionedData = migrator.generateInitialState(firstTimeState)
    console.error('ecf-wallet - Empty vault found - unable to recover')
  }

  // migrate data
  versionedData = await migrator.migrateData(versionedData)
  if (!versionedData) {
    throw new Error('ecf-wallet - migrator returned undefined')
  }

  // write to disk
  if (localStore.isSupported) {
    await localStore.set(versionedData)
  } else {
    // throw in setTimeout so as to not block boot
    setTimeout(() => {
      throw new Error('ecf-wallet - Localstore not supported')
    })
  }

  // return just the data
  return versionedData.data
}

/**
 * Initializes the ecf-wallet Controller with any initial state and default language.
 * Configures platform-specific error reporting strategy.
 * Streams emitted state updates to platform-specific storage strategy.
 * Creates platform listeners for new Dapps/Contexts, and sets up their data connections to the controller.
 *
 * @param {Object} initState - The initial state to start the controller with, matches the state that is emitted from the controller.
 * @param {string} initLangCode - The region code for the language preferred by the current user.
 * @returns {Promise} - After setup is complete.
 */
async function setupController (initState, initLangCode) {
  //
  // ecf-wallet Controller
  //

  const encryptor = new SessionEncryptor(extension.storage.session)
  const controller = new EcfWalletController({
    encryptor,
    // User confirmation callbacks:
    showUnconfirmedMessage: triggerUi,
    showUnapprovedTx: triggerUi,
    showPermissionRequest: triggerUi,
    showUnlockRequest: triggerUi,
    openPopup,
    // initial state
    initState,
    // initial locale code
    initLangCode,
    // platform specific api
    platform,
    getRequestAccountTabIds: () => {
      return requestAccountTabIds
    },
    getOpenEcfWalletTabsIds: () => {
      return openEcfWalletTabsIDs
    },
  })

  controller.keyringController.on('lock', () => {
    encryptor.clear().catch(log.error)
    closeHardwareConnections().catch(log.error)
  })
  controller.keyringController.memStore.subscribe(({ isUnlocked }) => {
    if (isUnlocked) {
      encryptor.save().catch(log.error)
    }
  })
  controller.keyringController.store.subscribe(() => {
    if (controller.isUnlocked()) {
      encryptor.save().catch(log.error)
    }
  })

  const { timeoutMinutes, lastActiveTime } = controller.appStateController.store.getState()
  const sessionExpired = timeoutMinutes && lastActiveTime + (timeoutMinutes * 60000) <= Date.now()
  if (!sessionExpired && await encryptor.restore(controller.keyringController.store.getState().vault)) {
    await controller.keyringController.submitPassword(encryptor.sessionPassword)
  } else {
    await encryptor.clear()
  }

  let lastDeadline
  const scheduleAutoLock = ({ timeoutMinutes: minutes, lastActiveTime: activeAt }) => {
    const deadline = minutes ? activeAt + (minutes * 60000) : null
    if (deadline === lastDeadline) {
      return
    }
    lastDeadline = deadline
    if (deadline) {
      extension.alarms.create('ecf-wallet-auto-lock', { when: deadline })
    } else {
      extension.alarms.clear('ecf-wallet-auto-lock')
    }
  }
  controller.appStateController.store.subscribe(scheduleAutoLock)
  scheduleAutoLock(controller.appStateController.store.getState())

  let hasPendingTransactions
  const scheduleTransactions = () => {
    const pending = controller.txController.txStateManager.getFilteredTxList({ status: 'submitted' }).length > 0
    if (pending === hasPendingTransactions) {
      return
    }
    hasPendingTransactions = pending
    if (pending) {
      extension.alarms.create('ecf-wallet-pending-transactions', { periodInMinutes: 1 })
    } else {
      extension.alarms.clear('ecf-wallet-pending-transactions')
    }
  }
  controller.txController.txStateManager.store.subscribe(scheduleTransactions)
  scheduleTransactions()

  const ensResolver = setupEnsIpfsResolver({
    getCurrentNetwork: controller.getCurrentNetwork,
    getIpfsGateway: controller.preferencesController.getIpfsGateway.bind(controller.preferencesController),
    provider: controller.provider,
  })

  // setup state persistence
  pump(
    asStream(controller.store),
    storeTransform(versionifyData),
    createStreamSink(persistData),
    (error) => {
      log.error('ecf-wallet - Persistence pipeline failed', error)
    },
  )

  /**
   * Assigns the given state to the versioned object (with metadata), and returns that.
   * @param {Object} state - The state object as emitted by the EcfWalletController.
   * @returns {VersionedData} - The state object wrapped in an object that includes a metadata key.
   */
  function versionifyData (state) {
    return { ...versionedData, data: state }
  }

  async function persistData (state) {
    if (!state) {
      throw new Error('ecf-wallet - updated state is missing')
    }
    if (!state.data) {
      throw new Error('ecf-wallet - updated state does not have data')
    }
    if (localStore.isSupported) {
      try {
        await localStore.set(state)
      } catch (err) {
        // log error so we dont break the pipeline
        log.error('error setting state in local store:', err)
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
  }

  const ecfWalletBlockedPorts = [
    'trezor-connect',
  ]

  const isClientOpenStatus = () => {
    return popupIsOpen || Boolean(Object.keys(openEcfWalletTabsIDs).length) || notificationIsOpen
  }

  /**
   * A runtime.Port object, as provided by the browser:
   * @see https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/runtime/Port
   * @typedef Port
   * @type Object
   */

  /**
   * Connects a Port to the ecf-wallet controller via a multiplexed duplex stream.
   * This method identifies trusted (ecf-wallet) interfaces, and connects them differently from untrusted (web pages).
   * @param {Port} remotePort - The port provided by a new context.
   */
  function connectRemote (remotePort, portStream) {
    const processName = remotePort.name
    const isEcfWalletInternalProcess = ecfWalletInternalProcessHash[processName] &&
      remotePort.sender?.id === extension.runtime.id &&
      remotePort.sender?.url?.startsWith(extension.runtime.getURL(''))

    if (ecfWalletBlockedPorts.includes(remotePort.name)) {
      return
    }

    if (isEcfWalletInternalProcess) {
      // communication with popup
      controller.isClientOpen = true
      controller.setupTrustedCommunication(portStream, remotePort.sender)

      if (processName === ENVIRONMENT_TYPE_POPUP) {
        popupIsOpen = true

        endOfStream(portStream, () => {
          popupIsOpen = false
          controller.isClientOpen = isClientOpenStatus()
        })
      }

      if (processName === ENVIRONMENT_TYPE_NOTIFICATION) {
        notificationIsOpen = true

        endOfStream(portStream, () => {
          notificationIsOpen = false
          controller.isClientOpen = isClientOpenStatus()
        })
      }

      if (processName === ENVIRONMENT_TYPE_FULLSCREEN) {
        const tabId = remotePort.sender.tab.id
        openEcfWalletTabsIDs[tabId] = true

        endOfStream(portStream, () => {
          delete openEcfWalletTabsIDs[tabId]
          controller.isClientOpen = isClientOpenStatus()
        })
      }
    } else {
      if (remotePort.sender && remotePort.sender.tab && remotePort.sender.url) {
        const tabId = remotePort.sender.tab.id
        const url = new URL(remotePort.sender.url)
        const { origin } = url

        remotePort.onMessage.addListener((msg) => {
          if (msg.data && msg.data.method === 'eth_requestAccounts') {
            requestAccountTabIds[origin] = tabId
          }
        })
      }
      connectExternal(remotePort, portStream)
    }
  }

  // communication with page or other extension
  function connectExternal (remotePort, portStream) {
    controller.setupUntrustedCommunication(portStream, remotePort.sender)
  }

  //
  // User Interface setup
  //

  updateBadge()
  controller.txController.on('update:badge', updateBadge)
  controller.messageManager.on('updateBadge', updateBadge)
  controller.personalMessageManager.on('updateBadge', updateBadge)
  controller.decryptMessageManager.on('updateBadge', updateBadge)
  controller.encryptionPublicKeyManager.on('updateBadge', updateBadge)
  controller.typedMessageManager.on('updateBadge', updateBadge)
  controller.permissionsController.permissions.subscribe(updateBadge)
  controller.appStateController.on('updateBadge', updateBadge)

  /**
   * Updates the Web Extension's "badge" number, on the little fox in the toolbar.
   * The number reflects the current number of pending transactions or message signatures needing user approval.
   */
  function updateBadge () {
    let label = ''
    const unapprovedTxCount = controller.txController.getUnapprovedTxCount()
    const { unapprovedMsgCount } = controller.messageManager
    const { unapprovedPersonalMsgCount } = controller.personalMessageManager
    const { unapprovedDecryptMsgCount } = controller.decryptMessageManager
    const { unapprovedEncryptionPublicKeyMsgCount } = controller.encryptionPublicKeyManager
    const { unapprovedTypedMessagesCount } = controller.typedMessageManager
    const pendingPermissionRequests = Object.keys(controller.permissionsController.permissions.state.permissionsRequests).length
    const waitingForUnlockCount = controller.appStateController.waitingForUnlock.length
    const count = unapprovedTxCount + unapprovedMsgCount + unapprovedPersonalMsgCount + unapprovedDecryptMsgCount + unapprovedEncryptionPublicKeyMsgCount +
                 unapprovedTypedMessagesCount + pendingPermissionRequests + waitingForUnlockCount
    if (count) {
      label = String(count)
    }
    extension.action.setBadgeText({ text: label })
    extension.action.setBadgeBackgroundColor({ color: '#037DD6' })
  }

  return { connectRemote, connectExternal, ensResolver, controller }
}

//
// Etc...
//

/**
 * Opens the browser popup for user confirmation
 */
async function triggerUi () {
  // A selected wallet tab in a background window must not suppress approval UI.
  const tabs = await platform.getActiveTabsInLastFocusedWindow()
  const currentlyActiveEcfWalletTab = Boolean(tabs.find((tab) => openEcfWalletTabsIDs[tab.id]))
  if (!popupIsOpen && !currentlyActiveEcfWalletTab) {
    await notificationManager.showPopup()
  }
}

/**
 * Opens the browser popup for user confirmation of watchAsset
 * then it waits until user interact with the UI
 */
async function openPopup () {
  await triggerUi()
  await new Promise(
    (resolve) => {
      const interval = setInterval(() => {
        if (!notificationIsOpen) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    },
  )
}

// On first install, open a new tab with ecf-wallet
extension.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install' && !(process.env.ECF_WALLET_DEBUG || process.env.IN_TEST)) {
    platform.openExtensionInBrowser()
  }
})
