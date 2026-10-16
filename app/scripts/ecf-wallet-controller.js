/**
 * @file      The central ecf-wallet controller. Aggregates other controllers and exports an api.
 * @copyright Copyright (c) 2018 MetaMask
 * @license   MIT
 */

import * as ethUtil from '@ethereumjs/util';
import createFilterMiddleware from '@metamask/eth-json-rpc-filters';
import createSubscriptionManager from '@metamask/eth-json-rpc-filters/subscriptionManager';
import { providerAsMiddleware } from '@metamask/eth-json-rpc-middleware';
import EthQuery from '@metamask/eth-query';
import {
  JsonRpcEngine,
  createAsyncMiddleware,
} from '@metamask/json-rpc-engine';
import { createEngineStream } from '@metamask/json-rpc-middleware-stream';
import { Mutex } from 'await-semaphore';
import eos from 'end-of-stream';
import EventEmitter from 'events';
import { debounce } from 'lodash';
import log from 'loglevel';
import { nanoid } from 'nanoid';
import pump from 'pump';

import accountImporter from './account-import-strategies';
import AlertController from './controllers/alert';
import AppStateController from './controllers/app-state';
import CachedBalancesController from './controllers/cached-balances';
import DetectTokensController from './controllers/detect-tokens';
import EnsController from './controllers/ens';
import NetworkController from './controllers/network';
import { normalizeChainId } from './controllers/network/chain-utils';
import NetworkRequestController from './controllers/network-requests';
import NftsController from './controllers/nfts';
import OnboardingController from './controllers/onboarding';
import { PermissionsController } from './controllers/permissions';
import { NOTIFICATION_NAMES } from './controllers/permissions/enums';
import PhishingController from './controllers/phishing';
import PreferencesController from './controllers/preferences';
import TransactionController from './controllers/transactions';
import AccountTracker from './lib/account-tracker';
import ComposableObservableStore from './lib/ComposableObservableStore';
import createDupeReqFilterStream from './lib/createDupeReqFilterStream';
import createLoggerMiddleware from './lib/createLoggerMiddleware';
import createMetaRPCHandler from './lib/createMetaRPCHandler';
import createMethodBlockMiddleware from './lib/createMethodBlockMiddleware';
import createOnboardingMiddleware from './lib/createOnboardingMiddleware';
import createOriginMiddleware from './lib/createOriginMiddleware';
import createTabIdMiddleware from './lib/createTabIdMiddleware';
import DecryptMessageManager from './lib/decrypt-message-manager';
import EncryptionPublicKeyManager from './lib/encryption-public-key-manager';
import { INCORRECT_PASSWORD_MESSAGE } from './lib/enums';
import extension from './lib/extension-api';
import {
  Trezor as TrezorKeyring,
  Ledger as LedgerBridgeKeyring,
} from './lib/hardware-keyrings';
import { createAddressBookController } from './lib/modern-controllers-implementation';
import KeyringController from './lib/modern-keyring-controller';
import NftImageStore from './lib/nft-image-store';
import nodeify from './lib/nodeify';
import OriginThrottler from './lib/origin-throttler';
import PersonalMessageManager from './lib/personal-message-manager';
import PhishingWarnings from './lib/phishing-warnings';
import { checksFailedAlert, getTypedDataAlerts } from './lib/security-checks';
import seedPhraseVerifier from './lib/seed-phrase-verifier';
import selectChainId from './lib/select-chain-id';
import { mnemonicToString } from './lib/software-keyrings';
import { isPrematureClose, setupMultiplex } from './lib/stream-utils';
import TypedMessageManager, {
  canonicalizeTypedMessage,
} from './lib/typed-message-manager';

/**
 * The origin of another extension that connects to the wallet.
 *
 * @param {object} sender - The connecting extension's MessageSender.
 * @returns {string} Its origin, such as chrome-extension://<id>.
 */
function externalExtensionOrigin(sender) {
  if (sender.origin && /^[a-z-]+-extension:\/\//u.test(sender.origin)) {
    return sender.origin;
  }
  return `chrome-extension://${sender.id}`;
}

/**
 * The security origin of the page or frame behind a connection.
 *
 * sender.url is only the frame's URL. A sandboxed frame, or a page served with
 * a sandbox CSP, keeps its site's URL but runs in an opaque origin, which
 * sender.origin reports as "null". Such a page does not act for the site, so
 * it has no origin here. The URL is used only where the browser does not
 * report sender.origin.
 *
 * @param {object} sender - The connecting page's MessageSender.
 * @returns {string|undefined} Its origin, or undefined if it is opaque.
 */
export function pageOrigin(sender) {
  let { origin } = sender;
  if (origin === undefined && sender.url) {
    origin = new URL(sender.url).origin;
  }
  return origin && origin !== 'null' ? origin : undefined;
}

/**
 * Decodes eth_decrypt params, whose data is the encrypted message as hex-encoded
 * JSON, for the keyring.
 *
 * @param {object} msgParams - The eth_decrypt params. Its data is replaced.
 * @returns {object} The same params, with the encrypted message as an object.
 */
function parseEncryptedMessage(msgParams) {
  const hex = ethUtil.stripHexPrefix(msgParams.data);
  msgParams.data = JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
  return msgParams;
}

// Restoring from a seed phrase adds accounts while they hold a balance, up to
// this many.
export const MAX_RESTORED_ACCOUNTS = 100;

export default class EcfWalletController extends EventEmitter {
  /**
   * Creates the controllers and wires them together.
   *
   * @class
   * @param {object} opts - The platform, persisted state and callbacks for the UI.
   */
  constructor(opts) {
    super();

    this.defaultMaxListeners = 20;

    this.sendUpdate = debounce(this.privateSendUpdate.bind(this), 200);
    this.opts = opts;
    this.platform = opts.platform;
    const initState = opts.initState || {};

    // this keeps track of how many "controllerStream" connections are open
    // the only thing that uses controller connections are open ecf-wallet UI instances
    this.activeControllerConnections = 0;

    this.getOpenEcfWalletTabsIds = opts.getOpenEcfWalletTabsIds;

    // observable state store
    this.store = new ComposableObservableStore(initState);

    // external connections by origin
    // Do not modify directly. Use the associated methods.
    this.connections = {};

    // lock to ensure only one vault created at once
    this.createVaultMutex = new Mutex();

    // next, we will initialize the controllers
    // controller initialization order matters

    this.networkController = new NetworkController(initState.NetworkController);

    this.preferencesController = new PreferencesController({
      initState: initState.PreferencesController,
      initLangCode: opts.initLangCode,
      showWatchAssetRequest: opts.showPermissionRequest,
      network: this.networkController,
      // The provider is created below, so it is read when needed.
      getProvider: () => this.provider,
    });

    this.appStateController = new AppStateController({
      addUnlockListener: this.on.bind(this, 'unlock'),
      isUnlocked: this.isUnlocked.bind(this),
      initState: initState.AppStateController,
      onInactiveTimeout: () => this.setLocked(),
      showUnlockRequest: opts.showUnlockRequest,
      preferencesStore: this.preferencesController.store,
    });

    this.phishingController = new PhishingController();
    this.phishingWarnings = new PhishingWarnings(
      opts.phishingWarningStorage ?? extension.storage?.session,
    );

    // now we can initialize the RPC provider, which other controllers require
    this.initializeProvider();
    ({ provider: this.provider, blockTracker: this.blockTracker } =
      this.networkController.getProviderAndBlockTracker());

    this.ensController = new EnsController({
      provider: this.provider,
      networkStore: this.networkController.networkStore,
    });

    // account tracker watches balances, nonces, and any code at their address
    this.accountTracker = new AccountTracker({
      provider: this.provider,
      blockTracker: this.blockTracker,
      network: this.networkController,
    });

    // start and stop polling for balances and token detection based on
    // whether any ecf-wallet UI is connected
    this.on('controllerConnectionChanged', (activeControllerConnections) => {
      const isClientOpen = activeControllerConnections > 0;
      if (isClientOpen) {
        this.accountTracker.start();
      } else {
        this.accountTracker.stop();
      }
      this.detectTokensController.isOpen = isClientOpen;
    });

    this.cachedBalancesController = new CachedBalancesController({
      accountTracker: this.accountTracker,
      getNetwork: this.networkController.getNetworkState.bind(
        this.networkController,
      ),
      initState: initState.CachedBalancesController,
    });

    this.onboardingController = new OnboardingController({
      initState: initState.OnboardingController,
      preferencesController: this.preferencesController,
    });

    // ensure accountTracker updates balances after network change
    this.networkController.on('networkDidChange', () => {
      this.accountTracker.refresh();
    });

    const additionalKeyrings = [TrezorKeyring, LedgerBridgeKeyring];
    this.keyringController = new KeyringController({
      keyringTypes: additionalKeyrings,
      initState: initState.KeyringController,
      getNetwork: this.networkController.getNetworkState.bind(
        this.networkController,
      ),
      encryptor: opts.encryptor || undefined,
    });
    this.keyringController.memStore.subscribe((s) =>
      this._onKeyringControllerUpdate(s),
    );
    this.keyringController.on('unlock', () => this._onUnlock());
    this.keyringController.on('lock', () => this._onLock());

    this.permissionsController = new PermissionsController(
      {
        getKeyringAccounts: this.keyringController.getAccounts.bind(
          this.keyringController,
        ),
        getUnlockPromise: this.appStateController.getUnlockPromise.bind(
          this.appStateController,
        ),
        notifyDomain: this.notifyConnections.bind(this),
        notifyAllDomains: this.notifyAllConnections.bind(this),
        preferences: this.preferencesController.store,
        showPermissionRequest: opts.showPermissionRequest,
      },
      initState.PermissionController,
      initState.PermissionsMetadata,
    );

    this.detectTokensController = new DetectTokensController({
      preferences: this.preferencesController,
      network: this.networkController,
      keyringMemStore: this.keyringController.memStore,
    });

    this.nftsController = new NftsController({
      preferencesStore: this.preferencesController.store,
      getChainId: () => normalizeChainId(this.networkController.getChainId()),
      getProvider: () => this.provider,
      isPhishing: (url) => {
        try {
          return this.phishingController.test(new URL(url).hostname);
        } catch (_) {
          return false;
        }
      },
      imageStore: new NftImageStore(),
      initState: initState.NftController,
    });

    const addressBook = createAddressBookController(
      initState.AddressBookController,
    );
    this.addressBookController = addressBook.controller;
    this.addressBookStore = addressBook.store;

    this.originThrottler = new OriginThrottler();

    this.networkRequestController = new NetworkRequestController({
      getCurrentChainId: () =>
        normalizeChainId(this.networkController.getChainId()),
      getCustomNetworks: () =>
        this.preferencesController.getFrequentRpcListDetail(),
      addCustomNetwork: async ({
        rpcUrl,
        chainId,
        ticker,
        chainName,
        blockExplorerUrl,
      }) => {
        const rpcPrefs = blockExplorerUrl ? { blockExplorerUrl } : {};
        await this.preferencesController.addToFrequentRpcList(
          rpcUrl,
          chainId,
          ticker,
          chainName,
          rpcPrefs,
        );
        this.networkController.setRpcTarget(
          rpcUrl,
          chainId,
          ticker,
          chainName,
          rpcPrefs,
        );
      },
      setCustomNetwork: ({ rpcUrl, chainId, ticker, nickname, rpcPrefs }) => {
        this.networkController.setRpcTarget(
          rpcUrl,
          chainId,
          ticker,
          nickname,
          rpcPrefs,
        );
      },
      setBuiltInNetwork: (type) => this.networkController.setProviderType(type),
      showApprovalRequest: opts.showPermissionRequest,
    });

    this.alertController = new AlertController({
      initState: initState.AlertController,
      preferencesStore: this.preferencesController.store,
    });

    this.txController = new TransactionController({
      initState: initState.TransactionController,
      getPermittedAccounts: this.permissionsController.getAccounts.bind(
        this.permissionsController,
      ),
      networkStore: this.networkController.networkStore,
      getChainId: () => this.networkController.getChainId(),
      preferencesStore: this.preferencesController.store,
      txHistoryLimit: 40,
      signTransaction: this.keyringController.signTransaction.bind(
        this.keyringController,
      ),
      provider: this.provider,
      blockTracker: this.blockTracker,
      getSecurityContext: () => this.getSecurityContext(),
    });
    this.txController.on('newUnapprovedTx', () => opts.showUnapprovedTx());

    this.txController.on(`tx:status-update`, async (txId, status) => {
      if (status === 'confirmed' || status === 'failed') {
        const txMeta = this.txController.txStateManager
          .getFullTxList()
          .find((tx) => tx.id === txId);
        if (txMeta) {
          this.platform.showTransactionNotification(txMeta);
        }
      }
    });

    this.networkController.lookupNetwork();
    this.personalMessageManager = new PersonalMessageManager({
      getChainId: () => this.networkController.getChainId(),
    });
    this.decryptMessageManager = new DecryptMessageManager();
    this.encryptionPublicKeyManager = new EncryptionPublicKeyManager();
    this.typedMessageManager = new TypedMessageManager({
      getChainId: () => this.networkController.getChainId(),
    });

    this.store.updateStructure({
      AppStateController: this.appStateController.store,
      TransactionController: this.txController.store,
      KeyringController: this.keyringController.store,
      PreferencesController: this.preferencesController.store,
      AddressBookController: this.addressBookStore,
      NftController: this.nftsController.store,
      NetworkController: this.networkController.store,
      CachedBalancesController: this.cachedBalancesController.store,
      AlertController: this.alertController.store,
      OnboardingController: this.onboardingController.store,
      PermissionController: this.permissionsController.permissionStore,
      PermissionsMetadata: this.permissionsController.store,
    });

    this.memStore = new ComposableObservableStore(null, {
      AppStateController: this.appStateController.store,
      NetworkController: this.networkController.store,
      AccountTracker: this.accountTracker.store,
      TxController: this.txController.memStore,
      CachedBalancesController: this.cachedBalancesController.store,
      PersonalMessageManager: this.personalMessageManager.memStore,
      DecryptMessageManager: this.decryptMessageManager.memStore,
      EncryptionPublicKeyManager: this.encryptionPublicKeyManager.memStore,
      TypesMessageManager: this.typedMessageManager.memStore,
      KeyringController: this.keyringController.memStore,
      PreferencesController: this.preferencesController.store,
      WatchAssetRequests: this.preferencesController.watchAssetStore,
      AddressBookController: this.addressBookStore,
      NftController: this.nftsController.store,
      NftImages: this.nftsController.imagesStore,
      AlertController: this.alertController.store,
      OnboardingController: this.onboardingController.store,
      PermissionController: this.permissionsController.permissionStore,
      PermissionsMetadata: this.permissionsController.store,
      PermissionsRequests: this.permissionsController.approvals.store,
      NetworkRequestController: this.networkRequestController.memStore,
      // ENS Controller
      EnsController: this.ensController.store,
    });
    this.memStore.subscribe(this.sendUpdate.bind(this));
    // keep external providers' chain in sync
    this.on('update', (memState) => this._onStateUpdate(memState));

    const password = process.env.CONF?.password;
    if (
      password &&
      !this.isUnlocked() &&
      this.onboardingController.completedOnboarding
    ) {
      this.submitPassword(password);
    }
  }

  /**
   * Constructor helper: initializes the network controller's provider.
   */
  initializeProvider() {
    this.networkController.initializeProvider({
      version: this.platform.getVersion(),
      // account mgmt
      getAccounts: async ({ origin }) => {
        if (origin === 'ecf-wallet') {
          const selectedAddress =
            this.preferencesController.getSelectedAddress();
          return selectedAddress ? [selectedAddress] : [];
        } else if (this.isUnlocked()) {
          return await this.permissionsController.getAccounts(origin);
        }
        return []; // changing this is a breaking change
      },
      // tx signing
      processTransaction: this.newUnapprovedTransaction.bind(this),
      // msg signing
      processTypedMessage: this.newUnsignedTypedMessage.bind(this),
      processPersonalMessage: this.newUnsignedPersonalMessage.bind(this),
      processDecryptMessage: this.newRequestDecryptMessage.bind(this),
      processEncryptionPublicKey: this.newRequestEncryptionPublicKey.bind(this),
      getPendingNonce: this.getPendingNonce.bind(this),
      getPendingTransactionByHash: (hash) =>
        this.txController.getFilteredTxList({ hash, status: 'submitted' })[0],
    });
  }

  /**
   * Gets the state an external origin's provider starts from. Accounts are
   * shared only while the wallet is unlocked.
   *
   * @param {string} origin - The origin to get the provider state for.
   * @returns {Promise<object>} isUnlocked, chainId, networkVersion, isConnected and accounts.
   */
  async getProviderState(origin) {
    const networkState = await this.waitForProviderNetworkState();
    return {
      isUnlocked: this.isUnlocked(),
      ...networkState,
      accounts: await this._getExposedAccounts(origin),
    };
  }

  /**
   * Gets the accounts an origin may see: its permitted accounts while the
   * wallet is unlocked, and none while it is locked.
   *
   * @param {string} origin - The origin to get the accounts for.
   * @returns {Promise<string[]>} The accounts.
   */
  async _getExposedAccounts(origin) {
    return this.isUnlocked()
      ? await this.permissionsController.getAccounts(origin)
      : [];
  }

  /**
   * The chain ID is unknown until the network answers eth_chainId, and
   * providers reject state without one, so wait for it.
   *
   * @param {number} [timeout] - Milliseconds to wait before giving up.
   * @returns {Promise<object>} The provider network state.
   */
  async waitForProviderNetworkState(timeout = 15000) {
    const current = this.getProviderNetworkState();
    if (current.chainId) {
      return current;
    }
    return new Promise((resolve, reject) => {
      const wait = {};
      const onUpdate = (memState) => {
        const state = this.getProviderNetworkState(memState);
        if (state.chainId) {
          clearTimeout(wait.timer);
          this.removeListener('update', onUpdate);
          resolve(state);
        }
      };
      wait.timer = setTimeout(() => {
        this.removeListener('update', onUpdate);
        reject(new Error('The network did not report a chain ID.'));
      }, timeout);
      this.on('update', onUpdate);
    });
  }

  /**
   * Gets the network part of an external origin's provider state.
   *
   * @param {object} [memState] - The current memState, if already available.
   * @returns {object} chainId, networkVersion and isConnected for external providers.
   */
  getProviderNetworkState(memState = this.getState()) {
    const { network, provider } = memState;
    const isConnected = network !== 'loading';
    return {
      chainId:
        this.networkController.getChainId() ||
        selectChainId({ network, provider }),
      networkVersion: isConnected ? network : 'loading',
      isConnected,
    };
  }

  //=============================================================================
  // EXPOSED TO THE UI SUBSYSTEM
  //=============================================================================

  /**
   * The state of the various controllers, made available to the UI
   *
   * @returns {object} The flattened memStore state, plus isInitialized.
   */
  getState() {
    const { vault } = this.keyringController.store.getState();
    const isInitialized = Boolean(vault);

    return {
      ...{ isInitialized },
      ...this.memStore.getFlatState(),
    };
  }

  /**
   * Returns an Object containing API Callback Functions.
   * These functions are the interface for the UI.
   * The API object can be transmitted over a stream with dnode.
   *
   * @returns {object} Object containing API functions.
   */
  getApi() {
    const {
      networkController,
      onboardingController,
      alertController,
      permissionsController,
      preferencesController,
      txController,
    } = this;

    return {
      // etc
      getState: (cb) => cb(null, this.getState()),
      setUsePhishDetect: nodeify(
        preferencesController.setUsePhishDetect,
        preferencesController,
      ),
      setUse4ByteResolution: nodeify(
        preferencesController.setUse4ByteResolution,
        preferencesController,
      ),
      setRejectRequestsOnClose: nodeify(
        preferencesController.setRejectRequestsOnClose,
        preferencesController,
      ),
      setUseNftDetection: nodeify(
        preferencesController.setUseNftDetection,
        preferencesController,
      ),
      setDisplayNftMedia: nodeify(
        preferencesController.setDisplayNftMedia,
        preferencesController,
      ),
      detectNfts: nodeify(this.nftsController.detectNfts, this.nftsController),
      getNftImages: nodeify(
        this.nftsController.getNftImages,
        this.nftsController,
      ),
      setFirstTimeFlowType: nodeify(
        preferencesController.setFirstTimeFlowType,
        preferencesController,
      ),
      setCurrentLocale: nodeify(
        preferencesController.setCurrentLocale,
        preferencesController,
      ),
      getOpenEcfWalletTabsIds: (cb) => cb(null, this.getOpenEcfWalletTabsIds()),

      // primary HD keyring management
      addNewAccount: nodeify(this.addNewAccount, this),
      verifySeedPhrase: nodeify(this.verifySeedPhrase, this),
      getSeedPhrase: nodeify(this.getSeedPhrase, this),
      removeAccount: nodeify(this.removeAccount, this),
      importAccountWithStrategy: nodeify(this.importAccountWithStrategy, this),

      // hardware wallets
      connectHardware: nodeify(this.connectHardware, this),
      forgetDevice: nodeify(this.forgetDevice, this),
      checkHardwareStatus: nodeify(this.checkHardwareStatus, this),
      unlockHardwareWalletAccount: nodeify(
        this.unlockHardwareWalletAccount,
        this,
      ),

      // vault management
      submitPassword: nodeify(this.submitPassword, this),
      approveNetworkRequest: nodeify(
        this.networkRequestController.approve,
        this.networkRequestController,
      ),
      rejectNetworkRequest: nodeify(
        this.networkRequestController.reject,
        this.networkRequestController,
      ),
      checkNetworkRequestRpc: nodeify(
        this.networkRequestController.checkRpc,
        this.networkRequestController,
      ),
      markNotificationPopupAsAutomaticallyClosed: (cb) => {
        this.opts.markNotificationPopupAsAutomaticallyClosed?.();
        cb(null);
      },
      scheduleClipboardClear: nodeify(this.scheduleClipboardClear, this),
      clearClipboard: nodeify(this.clearClipboard, this),

      // network management
      setProviderType: nodeify(
        networkController.setProviderType,
        networkController,
      ),
      setCustomRpc: nodeify(this.setCustomRpc, this),
      updateAndSetCustomRpc: nodeify(this.updateAndSetCustomRpc, this),
      delCustomRpc: nodeify(this.delCustomRpc, this),

      // PreferencesController
      setSelectedAddress: nodeify(
        preferencesController.setSelectedAddress,
        preferencesController,
      ),
      addToken: nodeify(preferencesController.addToken, preferencesController),
      removeToken: nodeify(
        preferencesController.removeToken,
        preferencesController,
      ),
      acceptWatchAsset: nodeify(
        preferencesController.acceptWatchAsset,
        preferencesController,
      ),
      rejectWatchAsset: nodeify(
        preferencesController.rejectWatchAsset,
        preferencesController,
      ),
      setAccountLabel: nodeify(
        preferencesController.setAccountLabel,
        preferencesController,
      ),
      setFeatureFlag: nodeify(
        preferencesController.setFeatureFlag,
        preferencesController,
      ),
      setPreference: nodeify(
        preferencesController.setPreference,
        preferencesController,
      ),
      completeOnboarding: nodeify(
        preferencesController.completeOnboarding,
        preferencesController,
      ),
      addKnownMethodData: nodeify(
        preferencesController.addKnownMethodData,
        preferencesController,
      ),

      // AddressController
      setAddressBook: nodeify(
        this.addressBookController.set,
        this.addressBookController,
      ),

      // AppStateController
      setLastActiveTime: nodeify(
        this.appStateController.setLastActiveTime,
        this.appStateController,
      ),
      setDefaultHomeActiveTabName: nodeify(
        this.appStateController.setDefaultHomeActiveTabName,
        this.appStateController,
      ),

      // EnsController
      tryReverseResolveAddress: nodeify(
        this.ensController.reverseResolveAddress,
        this.ensController,
      ),

      // KeyringController
      setLocked: nodeify(this.setLocked, this),
      createNewVaultAndKeychain: nodeify(this.createNewVaultAndKeychain, this),
      createNewVaultAndRestore: nodeify(this.createNewVaultAndRestore, this),
      exportAccount: nodeify(this.exportAccount, this),

      // txController
      cancelTransaction: nodeify(txController.cancelTransaction, txController),
      updateTransaction: nodeify(txController.updateTransaction, txController),
      updateAndApproveTransaction: nodeify(
        txController.updateAndApproveTransaction,
        txController,
      ),
      createCancelTransaction: nodeify(this.createCancelTransaction, this),
      createSpeedUpTransaction: nodeify(this.createSpeedUpTransaction, this),
      estimateGas: nodeify(this.estimateGas, this),

      // personalMessageManager
      signPersonalMessage: nodeify(this.signPersonalMessage, this),
      cancelPersonalMessage: this._cancelMessage.bind(
        this,
        this.personalMessageManager,
      ),

      // typedMessageManager
      signTypedMessage: nodeify(this.signTypedMessage, this),
      cancelTypedMessage: this._cancelMessage.bind(
        this,
        this.typedMessageManager,
      ),

      // decryptMessageManager
      decryptMessage: nodeify(this.decryptMessage, this),
      decryptMessageInline: nodeify(this.decryptMessageInline, this),
      cancelDecryptMessage: this._cancelMessage.bind(
        this,
        this.decryptMessageManager,
      ),

      // EncryptionPublicKeyManager
      encryptionPublicKey: nodeify(this.encryptionPublicKey, this),
      cancelEncryptionPublicKey: this._cancelMessage.bind(
        this,
        this.encryptionPublicKeyManager,
      ),

      // onboarding controller
      setSeedPhraseBackedUp: nodeify(
        onboardingController.setSeedPhraseBackedUp,
        onboardingController,
      ),

      // alert controller
      setAlertEnabledness: nodeify(
        alertController.setAlertEnabledness,
        alertController,
      ),
      setUnconnectedAccountAlertShown: nodeify(
        this.alertController.setUnconnectedAccountAlertShown,
        this.alertController,
      ),

      // permissions
      approvePermissionsRequest: nodeify(
        permissionsController.approvePermissionsRequest,
        permissionsController,
      ),
      rejectPermissionsRequest: nodeify(
        permissionsController.rejectPermissionsRequest,
        permissionsController,
      ),
      removePermissionsFor: permissionsController.removePermissionsFor.bind(
        permissionsController,
      ),
      addPermittedAccount: nodeify(
        permissionsController.addPermittedAccount,
        permissionsController,
      ),
      removePermittedAccount: nodeify(
        permissionsController.removePermittedAccount,
        permissionsController,
      ),
      requestAccountsPermissionWithId: nodeify(
        permissionsController.requestAccountsPermissionWithId,
        permissionsController,
      ),
    };
  }

  //=============================================================================
  // VAULT / KEYRING RELATED METHODS
  //=============================================================================

  /**
   * Creates a new Vault and create a new keychain.
   *
   * A vault, or KeyringController, is a controller that contains
   * many different account strategies, currently called Keyrings.
   * Creating it new means wiping all previous keyrings.
   *
   * A keychain, or keyring, controls many accounts with a single backup and signing strategy.
   * For example, a mnemonic phrase can generate many accounts, and is a keyring.
   *
   * @param {string} password - The password to encrypt the vault with.
   *
   * @returns {object} vault
   */
  async createNewVaultAndKeychain(password) {
    const releaseLock = await this.createVaultMutex.acquire();
    try {
      let vault;
      const accounts = await this.keyringController.getAccounts();
      const { vault: existingVault } = this.keyringController.store.getState();
      if (existingVault && !this.isUnlocked()) {
        // A locked wallet reports no accounts, so without this check a new
        // vault would silently replace the user's existing one.
        throw new Error(
          'EcfWalletController - a vault already exists; unlock it or restore it from its seed phrase',
        );
      }
      if (existingVault || accounts.length > 0) {
        vault = await this.keyringController.fullUpdate();
      } else {
        vault =
          await this.keyringController.createNewVaultAndKeychain(password);
        const addresses = await this.keyringController.getAccounts();
        this.preferencesController.setAddresses(addresses);
        this.selectFirstIdentity();
      }
      return vault;
    } finally {
      releaseLock();
    }
  }

  /**
   * Create a new Vault and restore an existent keyring.
   *
   * @param {string} password - The password to encrypt the vault with.
   * @param {string} seed - The seed phrase to restore.
   * @returns {Promise<object>} The keyring controller's memory state.
   */
  async createNewVaultAndRestore(password, seed) {
    const releaseLock = await this.createVaultMutex.acquire();
    try {
      let accounts, lastBalance;

      const { keyringController } = this;

      // Nothing is cleared until the new vault is sure to be created: a
      // mistyped seed phrase must not cost the user their account names and
      // site connections.
      keyringController.assertRestorable(password, seed);

      // clear known identities
      this.preferencesController.setAddresses([]);

      // clear permissions
      this.permissionsController.clearPermissions();

      // clear accounts in accountTracker
      this.accountTracker.clearAccounts();

      // clear cachedBalances
      this.cachedBalancesController.clearCachedBalances();

      // clear unapproved transactions
      this.txController.txStateManager.clearUnapprovedTxs();

      // create new vault
      const vault = await keyringController.createNewVaultAndRestore(
        password,
        seed,
      );

      const ethQuery = new EthQuery(this.provider);
      accounts = await keyringController.getAccounts();
      lastBalance = await this.getBalance(
        accounts[accounts.length - 1],
        ethQuery,
      ).catch(() => '0x0');

      const primaryKeyring = this._getPrimaryKeyring();

      // Add accounts until one has no balance. The vault is already replaced,
      // so if the network fails, or never reports an empty account, keep the
      // accounts found so far rather than fail or loop forever.
      try {
        while (
          lastBalance !== '0x0' &&
          accounts.length < MAX_RESTORED_ACCOUNTS
        ) {
          await keyringController.addNewAccount(primaryKeyring);
          accounts = await keyringController.getAccounts();
          lastBalance = await this.getBalance(
            accounts[accounts.length - 1],
            ethQuery,
          );
        }
      } catch (error) {
        log.warn('ecf-wallet - stopped looking for used accounts', error);
        accounts = await keyringController.getAccounts();
      }

      // set new identities
      this.preferencesController.setAddresses(accounts);
      this.selectFirstIdentity();
      return vault;
    } finally {
      releaseLock();
    }
  }

  /**
   * Get an account balance from the AccountTracker or request it directly from the network.
   *
   * @param {string} address - The account address
   * @param {EthQuery} ethQuery - The EthQuery instance to use when asking the network
   * @returns {Promise<string>} The balance, as a hex string.
   */
  getBalance(address, ethQuery) {
    return new Promise((resolve, reject) => {
      const cached = this.accountTracker.store.getState().accounts[address];

      if (cached && cached.balance) {
        resolve(cached.balance);
      } else {
        ethQuery.getBalance(address, (error, balance) => {
          if (error) {
            reject(error);
            log.error(error);
          } else {
            resolve(balance || '0x0');
          }
        });
      }
    });
  }

  /**
   * Addresses the user already knows, for the on-device transaction checks.
   *
   * @returns {object} Lower-case sets of the user's accounts, contacts and tracked tokens.
   */
  getSecurityContext() {
    const { identities = {}, tokens = [] } =
      this.preferencesController.store.getState();
    const { addressBook = {} } = this.addressBookController.state;
    const contacts = Object.values(addressBook).flatMap((entries) =>
      Object.keys(entries || {}),
    );
    return {
      ownAccounts: new Set(
        Object.keys(identities).map((address) => address.toLowerCase()),
      ),
      contacts: new Set(contacts.map((address) => address.toLowerCase())),
      tokenContracts: new Set(
        tokens.map(({ address }) => address.toLowerCase()),
      ),
    };
  }

  /**
   * Runs the on-device checks for typed data, such as token permits. A failing
   * check must not block the request, so errors yield an alert that the
   * checks failed.
   *
   * @param {object} msgParams - The params passed to eth_signTypedData.
   * @returns {Promise<object[]>} Alerts, most severe first.
   */
  async getTypedDataAlerts(msgParams) {
    try {
      return await getTypedDataAlerts({
        data: msgParams.data,
        getCode: (address) => this.txController.query.getCode(address),
        ownAccounts: this.getSecurityContext().ownAccounts,
      });
    } catch (error) {
      log.warn('Typed data checks failed', error);
      return [checksFailedAlert()];
    }
  }

  getCurrentNetwork = () => {
    return this.networkController.store.getState().network;
  };

  /**
   * Submits the user's password and attempts to unlock the vault.
   * Also synchronizes the preferencesController, to ensure its schema
   * is up to date with known accounts once the vault is decrypted.
   *
   * @param {string} password - The user's password
   * @returns {Promise<object>} The keyringController update.
   */
  async submitPassword(password) {
    await this.keyringController.submitPassword(password);

    // The vault is open from here. Priming the block tracker reaches the
    // network, and an unreachable network does not mean the password was
    // wrong, so it must not fail the unlock.
    try {
      await this.blockTracker.checkForLatestBlock();
    } catch (error) {
      log.error(
        'ecf-wallet - unlocked, but could not reach the network',
        error,
      );
    }

    return this.keyringController.fullUpdate();
  }

  /**
   * Clears the clipboard after a delay, once a secret has been copied.
   *
   * @returns {Promise<boolean>} Whether the clear was scheduled.
   */
  async scheduleClipboardClear() {
    return this.opts.clipboardCleaner
      ? this.opts.clipboardCleaner.schedule()
      : false;
  }

  /**
   * Clears the clipboard now.
   *
   * @returns {Promise<boolean>} Whether the clipboard was cleared.
   */
  async clearClipboard() {
    return this.opts.clipboardCleaner
      ? this.opts.clipboardCleaner.clear()
      : false;
  }

  /**
   * @typedef {object} Identity
   * @property {string} name - The account nickname.
   * @property {string} address - The account's ethereum address, in lower case.
   */

  /**
   * Sets the first address in the state to the selected address
   */
  selectFirstIdentity() {
    const { identities } = this.preferencesController.store.getState();
    const address = Object.keys(identities)[0];
    this.preferencesController.setSelectedAddress(address);
  }

  //
  // Hardware
  //

  async getKeyringForDevice(deviceName, hdPath = null) {
    let keyringName = null;
    switch (deviceName) {
      case 'trezor':
        keyringName = TrezorKeyring.type;
        break;
      case 'ledger':
        keyringName = LedgerBridgeKeyring.type;
        break;
      default:
        throw new Error(
          'EcfWalletController:getKeyringForDevice - Unknown device',
        );
    }
    let keyring =
      await this.keyringController.getKeyringsByType(keyringName)[0];
    if (!keyring) {
      keyring = await this.keyringController.addNewKeyring(keyringName);
    }
    if (hdPath && keyring.setHdPath) {
      keyring.setHdPath(hdPath);
    }

    keyring.network = this.networkController.getProviderConfig().type;

    return keyring;
  }

  /**
   * Fetch account list from a hardware wallet.
   *
   * @param {string} deviceName - The device type: 'trezor' or 'ledger'.
   * @param {number} page - -1 for the previous page, 1 for the next, or anything else for the first.
   * @param {string} [hdPath] - The HD path to derive accounts at.
   * @returns {Promise<object[]>} accounts
   */
  async connectHardware(deviceName, page, hdPath) {
    const keyring = await this.getKeyringForDevice(deviceName, hdPath);
    let accounts = [];
    switch (page) {
      case -1:
        accounts = await keyring.getPreviousPage();
        break;
      case 1:
        accounts = await keyring.getNextPage();
        break;
      default:
        accounts = await keyring.getFirstPage();
    }

    // Merge with existing accounts
    // and make sure addresses are not repeated
    const oldAccounts = await this.keyringController.getAccounts();
    const accountsToTrack = [
      ...new Set(
        oldAccounts.concat(accounts.map((a) => a.address.toLowerCase())),
      ),
    ];
    this.accountTracker.syncWithAddresses(accountsToTrack);
    return accounts;
  }

  /**
   * Check if the device is unlocked
   *
   * @param {string} deviceName - The device type: 'trezor' or 'ledger'.
   * @param {string} [hdPath] - The HD path to derive accounts at.
   * @returns {Promise<boolean>} Whether the device is unlocked.
   */
  async checkHardwareStatus(deviceName, hdPath) {
    const keyring = await this.getKeyringForDevice(deviceName, hdPath);
    return keyring.isUnlocked();
  }

  /**
   * Forgets a hardware wallet device.
   *
   * @param {string} deviceName - The device type: 'trezor' or 'ledger'.
   * @returns {Promise<boolean>} True once the device is forgotten.
   */
  async forgetDevice(deviceName) {
    const keyring = await this.getKeyringForDevice(deviceName);
    await keyring.forgetDevice();
    return true;
  }

  /**
   * Imports an account from a hardware wallet.
   *
   * @param {number|string} index - The index of the account on the device.
   * @param {string} deviceName - The device type: 'trezor' or 'ledger'.
   * @param {string} [hdPath] - The HD path to derive accounts at.
   * @returns {Promise<object>} keyState
   */
  async unlockHardwareWalletAccount(index, deviceName, hdPath) {
    const keyring = await this.getKeyringForDevice(deviceName, hdPath);

    keyring.setAccountToUnlock(index);
    return this._addAccount(keyring, {
      // Label the account Trezor 1 / Ledger 1, etc
      label: `${deviceName[0].toUpperCase()}${deviceName.slice(1)} ${parseInt(index, 10) + 1}`,
    });
  }

  //
  // Account Management
  //

  /**
   * Adds a new account to the default (first) HD seed phrase Keyring.
   *
   * @returns {Promise<object>} keyState
   */
  async addNewAccount() {
    return this._addAccount(this._getPrimaryKeyring(), {
      verifySeedPhrase: true,
    });
  }

  /**
   * Adds an account to a keyring, records it in preferences and selects it.
   *
   * @param {object} keyring - The keyring to add the account to.
   * @param {object} [options] - Options.
   * @param {string} [options.label] - A label for the new account.
   * @param {boolean} [options.verifySeedPhrase] - Whether to check the seed
   * phrase before the new account is recorded.
   * @returns {Promise<object>} keyState
   */
  async _addAccount(keyring, { label, verifySeedPhrase = false } = {}) {
    const { keyringController, preferencesController } = this;
    const oldAccounts = await keyringController.getAccounts();
    const keyState = await keyringController.addNewAccount(keyring);
    const newAccounts = await keyringController.getAccounts();

    if (verifySeedPhrase) {
      await this.verifySeedPhrase();
    }

    preferencesController.setAddresses(newAccounts);
    newAccounts.forEach((address) => {
      if (!oldAccounts.includes(address)) {
        if (label) {
          preferencesController.setAccountLabel(address, label);
        }
        preferencesController.setSelectedAddress(address);
      }
    });

    const { identities } = preferencesController.store.getState();
    return { ...keyState, identities };
  }

  /**
   * Returns the first HD seed phrase keyring.
   *
   * @returns {object} The primary keyring.
   */
  _getPrimaryKeyring() {
    const primaryKeyring =
      this.keyringController.getKeyringsByType('HD Key Tree')[0];
    if (!primaryKeyring) {
      throw new Error('EcfWalletController - No HD Key Tree found');
    }
    return primaryKeyring;
  }

  /**
   * Verifies the validity of the current vault's seed phrase.
   *
   * Validity: seed phrase restores the accounts belonging to the current vault.
   *
   * Called when the first account is created and on unlocking the vault. It
   * does not return the seed phrase; getSeedPhrase does, given the password.
   */
  async verifySeedPhrase() {
    await this._getVerifiedSeedPhrase();
  }

  /**
   * Returns the current vault's seed phrase, after checking the password, so
   * that script running in a wallet page cannot read it without the password.
   *
   * @param {string} password - The wallet password.
   * @returns {Promise<string>} The verified seed phrase.
   */
  async getSeedPhrase(password) {
    await this._checkPassword(password);
    return this._getVerifiedSeedPhrase();
  }

  /**
   * Returns an account's private key, after checking the password.
   *
   * @param {string} address - The account to export.
   * @param {string} password - The wallet password.
   * @returns {Promise<string>} The private key.
   */
  async exportAccount(address, password) {
    await this._checkPassword(password);
    return this.keyringController.exportAccount(address);
  }

  /**
   * Checks the wallet password, failing with INCORRECT_PASSWORD_MESSAGE so
   * that the UI can tell a wrong password from other failures.
   *
   * @param {string} password - The wallet password.
   */
  async _checkPassword(password) {
    try {
      await this.keyringController.verifyPassword(password);
    } catch (_) {
      throw new Error(INCORRECT_PASSWORD_MESSAGE);
    }
  }

  /**
   * Reads the seed phrase and checks that it restores the vault's accounts.
   *
   * @returns {Promise<string>} The verified seed phrase.
   */
  async _getVerifiedSeedPhrase() {
    const primaryKeyring = this._getPrimaryKeyring();

    const serialized = await primaryKeyring.serialize();
    // The keyring serializes its mnemonic as UTF-8 bytes.
    const seedWords = mnemonicToString(serialized.mnemonic);

    const accounts = await primaryKeyring.getAccounts();
    if (accounts.length < 1) {
      throw new Error('EcfWalletController - No accounts found');
    }

    try {
      await seedPhraseVerifier.verifyAccounts(accounts, seedWords);
      return seedWords;
    } catch (err) {
      log.error(err.message);
      throw err;
    }
  }

  /**
   * Removes an account from state / storage.
   *
   * @param {string} address - A hex address
   * @returns {Promise<string>} The removed address.
   */
  async removeAccount(address) {
    // Remove all associated permissions
    await this.permissionsController.removeAllAccountPermissions(address);
    // Remove account from the preferences controller
    this.preferencesController.removeAddress(address);
    // Remove account from the account tracker controller
    this.accountTracker.removeAccount([address]);

    // Remove account from the keyring
    await this.keyringController.removeAccount(address);
    return address;
  }

  /**
   * Imports an account with the specified import strategy.
   * These are defined in app/scripts/account-import-strategies
   * Each strategy represents a different way of serializing an Ethereum key pair.
   *
   * @param {string} strategy - A unique identifier for an account import strategy.
   * @param {any} args - The data required by that strategy to import an account.
   */
  async importAccountWithStrategy(strategy, args) {
    const privateKey = await accountImporter.importAccount(strategy, args);
    const keyring = await this.keyringController.addNewKeyring(
      'Simple Key Pair',
      [privateKey],
    );
    const accounts = await keyring.getAccounts();
    // update accounts in preferences controller
    const allAccounts = await this.keyringController.getAccounts();
    this.preferencesController.setAddresses(allAccounts);
    // set new account as selected
    await this.preferencesController.setSelectedAddress(accounts[0]);
  }

  // ---------------------------------------------------------------------------
  // Identity Management (signature operations)

  /**
   * Called when a Dapp suggests a new tx to be signed.
   * this wrapper needs to exist so we can provide a reference to
   *  "newUnapprovedTransaction" before "txController" is instantiated
   *
   * @param {object} txParams - The params of the transaction.
   * @param {object} req - (optional) the original request, containing the origin
   * @returns {Promise<string>} The hash of the transaction after being submitted to the network.
   */
  async newUnapprovedTransaction(txParams, req) {
    return await this.txController.newUnapprovedTransaction(txParams, req);
  }

  /**
   * Queues a message for the user's approval and opens the UI to show it.
   *
   * @param {object} messageManager - The manager for the message's type.
   * @param {...any} args - The arguments for its addUnapprovedMessageAsync.
   * @returns {Promise<string>} The result, once the user approves the message.
   */
  _addUnapprovedMessage(messageManager, ...args) {
    const promise = messageManager.addUnapprovedMessageAsync(...args);
    this.sendUpdate();
    this.opts.showUnconfirmedMessage();
    return promise;
  }

  /**
   * Rejects a message the user cancelled.
   *
   * @param {object} messageManager - The manager for the message's type.
   * @param {string} msgId - The ID of the message to cancel.
   * @param {Function} [cb] - Called with a full state update.
   */
  _cancelMessage(messageManager, msgId, cb) {
    messageManager.rejectMsg(msgId);
    if (typeof cb === 'function') {
      cb(null, this.getState());
    }
  }

  /**
   * Refuses every request still waiting for the user, as upstream does when
   * the user closes the notification window, so that no site is left
   * waiting on a prompt that is gone. A site waiting only for the wallet to
   * unlock keeps waiting, as upstream's does; it is answered on unlock.
   */
  async rejectPendingApprovals() {
    const rejections = [
      ...Object.values(
        this.txController.txStateManager.getUnapprovedTxList(),
      ).map(
        ({ id }) =>
          () =>
            this.txController.cancelTransaction(id),
      ),
      ...[
        this.personalMessageManager,
        this.typedMessageManager,
        this.decryptMessageManager,
        this.encryptionPublicKeyManager,
      ].flatMap((messageManager) =>
        Object.values(messageManager.getUnapprovedMsgs()).map(
          ({ id }) =>
            () =>
              messageManager.rejectMsg(id),
        ),
      ),
      ...this.permissionsController.approvals.store
        .getState()
        .permissionsRequests.map(
          ({ metadata }) =>
            () =>
              this.permissionsController.rejectPermissionsRequest(metadata.id),
        ),
      () => this.networkRequestController.rejectAll(),
      () => this.preferencesController.rejectPendingWatchAssets(),
    ];
    // One failure must not leave the other sites waiting.
    for (const reject of rejections) {
      try {
        await reject();
      } catch (error) {
        log.error(error);
      }
    }
  }

  // personal_sign methods:

  /**
   * Called when a dapp uses the personal_sign method.
   *
   * @param {object} msgParams - The params of the message to sign & return to the Dapp.
   * @param {object} req - (optional) the original request, containing the origin
   * @returns {Promise<string>} The signature, passed back to the requesting Dapp.
   */
  async newUnsignedPersonalMessage(msgParams, req) {
    return this._addUnapprovedMessage(
      this.personalMessageManager,
      msgParams,
      req,
    );
  }

  /**
   * Signifies a user's approval to sign a personal_sign message in queue.
   * Triggers signing, and the callback function from newUnsignedPersonalMessage.
   *
   * @param {object} msgParams - The params of the message to sign & return to the Dapp.
   * @returns {Promise<object>} A full state update.
   */
  async signPersonalMessage(msgParams) {
    log.info('EcfWalletController - signPersonalMessage');
    const msgId = msgParams.ecfWalletId;
    // Only the call that successfully claims approval owns the signing result.
    // A duplicate/stale approval must not fail somebody else's pending request.
    const cleanMsgParams =
      await this.personalMessageManager.approveMessage(msgParams);
    try {
      const rawSig =
        await this.keyringController.signPersonalMessage(cleanMsgParams);
      // tells the listener that the message has been signed
      // and can be returned to the dapp
      this.personalMessageManager.setMsgStatusSigned(msgId, rawSig);
      return this.getState();
    } catch (error) {
      log.info('EcfWalletController - personal_sign failed.', error);
      // Settle the dapp's request, then tell the UI why signing failed.
      this.personalMessageManager.errorMessage(msgId, error);
      throw error;
    }
  }

  // eth_decrypt methods

  /**
   * Called when a dapp uses the eth_decrypt method.
   *
   * @param {object} msgParams - The params of the message to sign & return to the Dapp.
   * @param {object} req - (optional) the original request, containing the origin
   * @returns {Promise<string>} The decrypted message, passed back to the requesting Dapp.
   */
  async newRequestDecryptMessage(msgParams, req) {
    return this._addUnapprovedMessage(
      this.decryptMessageManager,
      msgParams,
      req,
    );
  }

  /**
   * Only decrypt message and don't touch transaction state
   *
   * @param {object} msgParams - The params of the message to decrypt.
   * @returns {Promise<object>} A full state update.
   */
  async decryptMessageInline(msgParams) {
    log.info('EcfWalletController - decryptMessageInline');
    // decrypt the message inline
    const msgId = msgParams.ecfWalletId;
    const msg = this.decryptMessageManager.getMsg(msgId);
    try {
      msg.rawData = await this.keyringController.decryptMessage(
        parseEncryptedMessage(msgParams),
      );
    } catch (e) {
      msg.error = e.message;
    }
    this.decryptMessageManager._updateMsg(msg);

    return this.getState();
  }

  /**
   * Signifies a user's approval to decrypt a message in queue.
   * Triggers decrypt, and the callback function from newUnsignedDecryptMessage.
   *
   * @param {object} msgParams - The params of the message to decrypt & return to the Dapp.
   * @returns {Promise<object>} A full state update.
   */
  async decryptMessage(msgParams) {
    log.info('EcfWalletController - decryptMessage');
    const msgId = msgParams.ecfWalletId;
    // Only the call that successfully claims approval owns the result; a
    // duplicate/stale approval must not mark the message as errored.
    const cleanMsgParams =
      await this.decryptMessageManager.approveMessage(msgParams);
    try {
      // decrypt the message
      const rawMess = await this.keyringController.decryptMessage(
        parseEncryptedMessage(cleanMsgParams),
      );
      // tells the listener that the message has been decrypted and can be returned to the dapp
      this.decryptMessageManager.setMsgStatusDecrypted(msgId, rawMess);
    } catch (error) {
      log.info('EcfWalletController - eth_decrypt failed.', error);
      this.decryptMessageManager.errorMessage(msgId, error);
    }
    return this.getState();
  }

  // eth_getEncryptionPublicKey methods

  /**
   * Called when a dapp uses the eth_getEncryptionPublicKey method.
   *
   * @param {object} msgParams - The params of the message to sign & return to the Dapp.
   * @param {object} req - (optional) the original request, containing the origin
   * @returns {Promise<string>} The public key, passed back to the requesting Dapp.
   */
  async newRequestEncryptionPublicKey(msgParams, req) {
    return this._addUnapprovedMessage(
      this.encryptionPublicKeyManager,
      msgParams,
      req,
    );
  }

  /**
   * Signifies a user's approval to receiving encryption public key in queue.
   * Triggers receiving, and the callback function from newUnsignedEncryptionPublicKey.
   *
   * @param {object} msgParams - The params of the message to receive & return to the Dapp.
   * @returns {Promise<object>} A full state update.
   */
  async encryptionPublicKey(msgParams) {
    log.info('EcfWalletController - encryptionPublicKey');
    const msgId = msgParams.ecfWalletId;
    // Only the call that successfully claims approval owns the result; a
    // duplicate/stale approval must not mark the message as errored.
    const params =
      await this.encryptionPublicKeyManager.approveMessage(msgParams);
    try {
      // EncryptionPublicKey message
      const publicKey = await this.keyringController.getEncryptionPublicKey(
        params.data,
      );

      // tells the listener that the message has been processed
      // and can be returned to the dapp
      this.encryptionPublicKeyManager.setMsgStatusReceived(msgId, publicKey);
    } catch (error) {
      log.info(
        'EcfWalletController - eth_getEncryptionPublicKey failed.',
        error,
      );
      this.encryptionPublicKeyManager.errorMessage(msgId, error);
    }
    return this.getState();
  }

  // eth_signTypedData methods

  /**
   * Called when a dapp uses the eth_signTypedData method, per EIP 712.
   *
   * @param {object} msgParams - The params passed to eth_signTypedData.
   * @param {object} req - (optional) the original request, containing the origin
   * @param {string} version - The typed data version: 'V1', 'V3' or 'V4'.
   * @returns {Promise<string>} The signature, passed back to the requesting Dapp.
   */
  async newUnsignedTypedMessage(msgParams, req, version) {
    // Check the values that will be signed, such as a bool sent as "true".
    const securityAlerts = ['V3', 'V4'].includes(version)
      ? await this.getTypedDataAlerts({
          ...msgParams,
          data: canonicalizeTypedMessage(msgParams.data, version),
        })
      : [];
    return this._addUnapprovedMessage(
      this.typedMessageManager,
      msgParams,
      req,
      version,
      securityAlerts,
    );
  }

  /**
   * The method for a user approving a call to eth_signTypedData, per EIP 712.
   * Triggers the callback in newUnsignedTypedMessage.
   *
   * @param {object} msgParams - The params passed to eth_signTypedData.
   * @returns {Promise<object>} Full state update.
   */
  async signTypedMessage(msgParams) {
    log.info('EcfWalletController - eth_signTypedData');
    const msgId = msgParams.ecfWalletId;
    const version = this.typedMessageManager.getMsg(msgId)?.msgParams.version;
    // Only the call that successfully claims approval owns the signing result.
    // A duplicate/stale approval must not fail somebody else's pending request.
    const cleanMsgParams =
      await this.typedMessageManager.approveMessage(msgParams);
    try {
      // For some reason every version after V1 used stringified params.
      if (version !== 'V1') {
        // But we don't have to require that. We can stop suggesting it now:
        if (typeof cleanMsgParams.data === 'string') {
          cleanMsgParams.data = JSON.parse(cleanMsgParams.data);
        }
      }

      const signature = await this.keyringController.signTypedMessage(
        cleanMsgParams,
        { version },
      );
      this.typedMessageManager.setMsgStatusSigned(msgId, signature);
      return this.getState();
    } catch (error) {
      log.info('EcfWalletController - eth_signTypedData failed.', error);
      // Settle the dapp's request, then tell the UI why signing failed.
      this.typedMessageManager.errorMessage(msgId, error);
      throw error;
    }
  }

  //=============================================================================
  // END (VAULT / KEYRING RELATED METHODS)
  //=============================================================================

  /**
   * Allows a user to attempt to cancel a previously submitted transaction by creating a new
   * transaction.
   *
   * @param {number} originalTxId - the id of the txMeta that you want to attempt to cancel
   * @param {string} [customGasPrice] - the hex value to use for the cancel transaction
   * @returns {object} ecf-wallet state
   */
  async createCancelTransaction(originalTxId, customGasPrice) {
    await this.txController.createCancelTransaction(
      originalTxId,
      customGasPrice,
    );
    const state = await this.getState();
    return state;
  }

  async createSpeedUpTransaction(originalTxId, customGasPrice, customGasLimit) {
    await this.txController.createSpeedUpTransaction(
      originalTxId,
      customGasPrice,
      customGasLimit,
    );
    const state = await this.getState();
    return state;
  }

  estimateGas(estimateGasParams) {
    // The query is promise-returning (pify), so a callback passed here would be
    // forwarded to the node as an RPC argument and never called, leaving the
    // send screen waiting on a gas estimate that never arrives.
    return this.txController.txGasUtil.query.estimateGas(estimateGasParams);
  }

  //=============================================================================
  // SETUP
  //=============================================================================

  /**
   * A runtime.MessageSender object, as provided by the browser:
   *
   * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/MessageSender
   * @typedef {object} MessageSender
   * @property {object} [tab] - The tab that opened the connection, if any.
   * @property {string} [id] - The ID of the extension that opened the connection.
   * @property {string} [url] - The URL of the page or frame that opened the connection.
   */

  /**
   * Used to create a multiplexed stream for connecting to an untrusted context
   * like a Dapp or other extension.
   *
   * @param {*} connectionStream - The Duplex stream to connect to.
   * @param {MessageSender} sender - The sender of the messages on this stream
   */
  setupUntrustedCommunication(connectionStream, sender) {
    if (this.checkForPhishing(sender)) {
      return;
    }

    const isOtherExtension = sender.id && sender.id !== extension.runtime.id;
    if (!isOtherExtension && !pageOrigin(sender)) {
      log.debug('ecf-wallet - no provider for an opaque origin', sender.url);
      return;
    }

    // setup multiplexing
    const mux = setupMultiplex(connectionStream);

    // messages between inpage and background
    this.setupProviderConnection(mux.createStream('provider'), sender);
  }

  /**
   * Used to create a multiplexed stream for connecting to a trusted context,
   * like our own user interfaces, which have the provider APIs, but also
   * receive the exported API from this controller, which includes trusted
   * functions, like the ability to approve transactions or sign messages.
   *
   * @param {*} connectionStream - The duplex stream to connect to.
   * @param {MessageSender} sender - The sender of the messages on this stream
   */
  setupTrustedCommunication(connectionStream, sender) {
    // setup multiplexing
    const mux = setupMultiplex(connectionStream);
    // connect features
    this.setupControllerConnection(mux.createStream('controller'));
    this.setupProviderConnection(mux.createStream('provider'), sender, true);
  }

  /**
   * Checks a page against the phishing list, if phishing detection is on, and
   * sends a flagged page's tab to the warning.
   *
   * @param {MessageSender} sender - The page, as the browser reported it
   * @returns {boolean} Whether the page was flagged
   */
  checkForPhishing(sender) {
    const { usePhishDetect } = this.preferencesController.store.getState();
    const { hostname } = new URL(sender.url);
    if (!usePhishDetect || !this.phishingController.test(hostname)) {
      return false;
    }
    log.debug('ecf-wallet - showing phishing warning for', hostname);
    this.showPhishingWarning(sender, hostname).catch((error) =>
      log.error('ecf-wallet - unable to show phishing warning', error),
    );
    return true;
  }

  /**
   * Replaces a flagged site with the phishing warning. The background
   * navigates the tab itself, so websites cannot load the warning page, and
   * remembers the site, so the page holds nothing a website could set.
   *
   * @private
   * @param {MessageSender} sender - The content script of the flagged site
   * @param {string} hostname - The flagged hostname
   */
  async showPhishingWarning(sender, hostname) {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      // Another extension, not a tab: refusing the connection is enough.
      return;
    }
    // A flagged site in a frame takes over the whole tab; continuing reloads
    // the page around it.
    const href =
      sender.frameId === undefined || sender.frameId === 0
        ? sender.url
        : (sender.tab.url ?? sender.url);
    await this.phishingWarnings.set(tabId, { hostname, href });
    await extension.tabs.update(tabId, {
      url: extension.runtime.getURL('phishing.html'),
    });
  }

  /**
   * Continues from the phishing warning in a tab to the site it was shown
   * for, which stays allowed for the rest of the session.
   *
   * @param {number} tabId - The tab showing the warning
   */
  async continueFromPhishingWarning(tabId) {
    const warning = await this.phishingWarnings.take(tabId);
    if (!warning) {
      return;
    }
    this.phishingController.bypass(warning.hostname);
    await extension.tabs.update(tabId, { url: warning.href });
  }

  /**
   * Serves our API to a wallet UI over a JSON-RPC stream, and pushes state
   * updates to it.
   *
   * @param {*} outStream - The stream to provide our API over.
   */
  setupControllerConnection(outStream) {
    const api = this.getApi();
    // report new active controller connection
    this.activeControllerConnections += 1;
    this.emit('controllerConnectionChanged', this.activeControllerConnections);
    outStream.on('data', createMetaRPCHandler(api, outStream));
    // push updates to the UI
    const sendUpdate = (update) => {
      if (!outStream.destroyed && !outStream.writableEnded) {
        outStream.write({
          jsonrpc: '2.0',
          method: 'sendUpdate',
          params: [update],
        });
      }
    };
    this.on('update', sendUpdate);
    eos(outStream, (err) => {
      this.removeListener('update', sendUpdate);
      this.activeControllerConnections -= 1;
      this.emit(
        'controllerConnectionChanged',
        this.activeControllerConnections,
      );
      // report any error
      if (err && !isPrematureClose(err)) {
        log.error(err);
      }
    });
  }

  /**
   * A method for serving our ethereum provider over a given stream.
   *
   * @param {*} outStream - The stream to provide over.
   * @param {MessageSender} sender - The sender of the messages on this stream
   * @param {boolean} isInternal - True if this is a connection with an internal process
   */
  setupProviderConnection(outStream, sender, isInternal) {
    let extensionId;
    if (sender.id && sender.id !== extension.runtime.id) {
      extensionId = sender.id;
    }
    // Another extension is its own site, with its own permissions. Its
    // sender.url is whatever page its script runs on, and using that would
    // hand it the permissions the user gave that page.
    let origin;
    if (isInternal) {
      origin = 'ecf-wallet';
    } else if (extensionId) {
      origin = externalExtensionOrigin(sender);
    } else {
      origin = pageOrigin(sender);
      if (!origin) {
        throw new Error('EcfWalletController - no origin for the connection');
      }
    }
    let tabId;
    if (sender.tab && sender.tab.id) {
      tabId = sender.tab.id;
    }

    const engine = this.setupProviderEngine({
      origin,
      location: sender.url,
      extensionId,
      tabId,
      isInternal,
    });

    // setup connection
    const providerStream = createEngineStream({ engine });

    const connectionId = this.addConnection(origin, { engine });

    pump(
      outStream,
      createDupeReqFilterStream(),
      providerStream,
      outStream,
      (err) => {
        // handle any middleware cleanup
        engine.destroy();
        connectionId && this.removeConnection(origin, connectionId);
        if (err && !isPrematureClose(err)) {
          log.error(err);
        }
      },
    );

    if (!isInternal) {
      // A page reconnecting after the background restarted may have missed
      // changes; the provider ignores notifications that change nothing.
      this._sendProviderState(origin, engine);
    }
  }

  /**
   * Sends the current chain and accounts to one provider connection.
   *
   * @param {string} origin - The connection's origin
   * @param {object} engine - The connection's RPC engine
   */
  async _sendProviderState(origin, engine) {
    try {
      const accounts = await this._getExposedAccounts(origin);
      const networkState = this.getProviderNetworkState();
      // Without a chain ID the provider would reject the update; one follows
      // from _onStateUpdate when the network reports it.
      if (networkState.chainId) {
        this._notify(engine, NOTIFICATION_NAMES.chainChanged, networkState);
      }
      this._notify(engine, NOTIFICATION_NAMES.accountsChanged, accounts);
    } catch (error) {
      log.warn('ecf-wallet - could not send provider state', error);
    }
  }

  /**
   * A method for creating a provider that is safely restricted for the requesting domain.
   *
   * @param {object} options - Provider engine options
   * @param {string} options.origin - The origin of the sender
   * @param {string} options.location - The full URL of the sender
   * @param {string} [options.extensionId] - The extension ID of the sender, if the sender is an external extension
   * @param {number} [options.tabId] - The tab ID of the sender - if the sender is within a tab
   * @param {boolean} [options.isInternal] - True if called for a connection to an internal process
   * @returns {JsonRpcEngine} The provider engine.
   */
  setupProviderEngine({
    origin,
    location,
    extensionId,
    tabId,
    isInternal = false,
  }) {
    // setup json rpc engine stack
    const engine = new JsonRpcEngine();
    const { provider, blockTracker } = this;

    // create filter polyfill middleware
    const filterMiddleware = createFilterMiddleware({ provider, blockTracker });

    // create subscription polyfill middleware
    const subscriptionManager = createSubscriptionManager({
      provider,
      blockTracker,
    });
    subscriptionManager.events.on('notification', (message) =>
      engine.emit('notification', message),
    );

    // append origin to each request
    engine.push(createOriginMiddleware({ origin }));
    // refuse unsafe methods before any permission or approval prompt
    engine.push(createMethodBlockMiddleware());
    if (!isInternal) {
      // The provider requests its initial state; later changes are notifications.
      engine.push(
        createAsyncMiddleware(async (req, res, next) => {
          if (req.method !== 'metamask_getProviderState') {
            await next();
            return;
          }
          res.result = await this.getProviderState(origin);
        }),
      );
    }
    if (!isInternal) {
      // refuse prompts from a site whose requests were just rejected repeatedly
      engine.push(this.originThrottler.createMiddleware({ origin }));
    }
    // network add and switch requests, each approved by the user
    engine.push(this.networkRequestController.createMiddleware({ origin }));
    // append tabId to each request if it exists
    if (tabId) {
      engine.push(createTabIdMiddleware({ tabId }));
    }
    // logging
    engine.push(createLoggerMiddleware({ origin }));
    engine.push(
      createOnboardingMiddleware({
        location,
        registerOnboarding: this.onboardingController.registerOnboarding,
      }),
    );
    // filter and subscription polyfills
    engine.push(filterMiddleware);
    engine.push(subscriptionManager.middleware);
    if (!isInternal) {
      // permissions
      engine.push(
        this.permissionsController.createMiddleware({ origin, extensionId }),
      );
    }
    // watch asset
    engine.push(
      this.preferencesController.requestWatchAsset.bind(
        this.preferencesController,
      ),
    );
    // forward to ecf-wallet primary provider
    engine.push(providerAsMiddleware(provider));
    return engine;
  }

  /**
   * Adds a reference to a connection by origin. Ignores the 'ecf-wallet' origin.
   * Caller must ensure that the returned id is stored such that the reference
   * can be deleted later.
   *
   * @param {string} origin - The connection's origin string.
   * @param {object} options - Data associated with the connection
   * @param {object} options.engine - The connection's JSON Rpc Engine
   * @returns {string} The connection's id (so that it can be deleted later)
   */
  addConnection(origin, { engine }) {
    if (origin === 'ecf-wallet') {
      return null;
    }

    if (!this.connections[origin]) {
      this.connections[origin] = {};
    }

    const id = nanoid();
    this.connections[origin][id] = {
      engine,
    };

    return id;
  }

  /**
   * Deletes a reference to a connection, by origin and id.
   * Ignores unknown origins.
   *
   * @param {string} origin - The connection's origin string.
   * @param {string} id - The connection's id, as returned from addConnection.
   */
  removeConnection(origin, id) {
    const connections = this.connections[origin];
    if (!connections) {
      return;
    }

    delete connections[id];

    if (Object.keys(connections).length === 0) {
      delete this.connections[origin];
    }
  }

  /**
   * Causes the RPC engines associated with the connections to the given origin
   * to emit a notification event with the given payload.
   * Does nothing if the extension is locked or the origin is unknown.
   *
   * @param {string} origin - The connection's origin string.
   * @param {any} payload - The event payload.
   */
  notifyConnections(origin, payload) {
    const connections = this.connections[origin];
    if (!this.isUnlocked() || !connections) {
      return;
    }

    Object.values(connections).forEach(
      ({ engine }) => engine && engine.emit('notification', payload),
    );
  }

  /**
   * Causes the RPC engines associated with all connections to emit a
   * notification event with the given payload.
   * Does nothing if the extension is locked.
   *
   * @param {any} payload - The event payload.
   */
  notifyAllConnections(payload) {
    if (!this.isUnlocked()) {
      return;
    }

    this._forEachEngine((engine) => engine.emit('notification', payload));
  }

  /**
   * Calls a function with the RPC engine of each provider connection.
   *
   * @param {Function} callback - Called with each engine and its origin.
   */
  _forEachEngine(callback) {
    Object.entries(this.connections).forEach(([origin, connections]) => {
      Object.values(connections).forEach(
        ({ engine }) => engine && callback(engine, origin),
      );
    });
  }

  /**
   * Sends a provider notification over one connection.
   *
   * @param {object} engine - The connection's RPC engine.
   * @param {string} method - The notification method.
   * @param {any} params - The notification params.
   */
  _notify(engine, method, params) {
    engine.emit('notification', { jsonrpc: '2.0', method, params });
  }

  /**
   * Unlocking shares each origin's permitted accounts with its providers again.
   */
  _onUnlock() {
    this._forEachEngine((engine, origin) =>
      this._sendProviderState(origin, engine),
    );
    this.emit('unlock');
  }

  /**
   * Locking hides all accounts from sites. This must reach every connection,
   * unlike notifications sent while unlocked.
   */
  _onLock() {
    this._forEachEngine((engine) =>
      this._notify(engine, NOTIFICATION_NAMES.accountsChanged, []),
    );
  }

  /**
   * Tells providers about network changes. The chain is not secret, so this
   * is sent whether or not the wallet is locked.
   *
   * @param {object} memState - The new memState
   */
  _onStateUpdate(memState) {
    const networkState = this.getProviderNetworkState(memState);
    if (!networkState.chainId) {
      return;
    }
    const { lastProviderNetworkState: last } = this;
    if (
      last &&
      last.chainId === networkState.chainId &&
      last.networkVersion === networkState.networkVersion &&
      last.isConnected === networkState.isConnected
    ) {
      return;
    }
    this.lastProviderNetworkState = networkState;
    this._forEachEngine((engine) =>
      this._notify(engine, NOTIFICATION_NAMES.chainChanged, networkState),
    );
  }

  // handlers

  /**
   * Handle a KeyringController update
   *
   * @param {object} state - the KC state
   * @returns {Promise<void>}
   * @private
   */
  async _onKeyringControllerUpdate(state) {
    const { keyrings } = state;
    const addresses = keyrings.reduce(
      (acc, { accounts }) => acc.concat(accounts),
      [],
    );

    if (!addresses.length) {
      return;
    }

    // Ensure preferences + identities controller know about all addresses
    this.preferencesController.syncAddresses(addresses);
    this.accountTracker.syncWithAddresses(addresses);
  }

  // misc

  /**
   * A method for emitting the full ecf-wallet state to all registered listeners.
   *
   * @private
   */
  privateSendUpdate() {
    this.emit('update', this.getState());
  }

  /**
   * Checks whether the vault is unlocked.
   *
   * @returns {boolean} Whether the extension is unlocked.
   */
  isUnlocked() {
    return this.keyringController.memStore.getState().isUnlocked;
  }

  //=============================================================================
  // MISCELLANEOUS
  //=============================================================================

  /**
   * Returns the nonce that will be associated with a transaction once approved
   *
   * @param {string} address - The hex string address for the transaction
   * @returns {Promise<number>} The pending nonce.
   */
  async getPendingNonce(address) {
    const { nonceDetails, releaseLock } =
      await this.txController.nonceTracker.getNonceLock(address);
    const pendingNonce = nonceDetails.params.highestSuggested;

    releaseLock();
    return pendingNonce;
  }

  //=============================================================================
  // CONFIG
  //=============================================================================

  // network
  /**
   * A method for selecting a custom URL for an ethereum RPC provider and updating it
   *
   * @param {string} rpcUrl - A URL for a valid Ethereum RPC API.
   * @param {string} chainId - The chainId of the selected network.
   * @param {string} ticker - The ticker symbol of the selected network.
   * @param {string} nickname - Optional nickname of the selected network.
   * @param {object} [rpcPrefs] - Network preferences, such as a block explorer URL.
   * @returns {Promise<string>} The RPC Target URL confirmed.
   */
  async updateAndSetCustomRpc(
    rpcUrl,
    chainId,
    ticker = 'ETH',
    nickname,
    rpcPrefs,
  ) {
    await this.preferencesController.updateRpc({
      rpcUrl,
      chainId,
      ticker,
      nickname,
      rpcPrefs,
    });
    this.networkController.setRpcTarget(
      rpcUrl,
      chainId,
      ticker,
      nickname,
      rpcPrefs,
    );
    return rpcUrl;
  }

  /**
   * A method for selecting a custom URL for an ethereum RPC provider.
   *
   * @param {string} rpcTarget - A URL for a valid Ethereum RPC API.
   * @param {string} chainId - The chainId of the selected network.
   * @param {string} ticker - The ticker symbol of the selected network.
   * @param {string} nickname - Optional nickname of the selected network.
   * @param {object} [rpcPrefs] - Network preferences, such as a block explorer URL.
   * @returns {Promise<string>} The RPC Target URL confirmed.
   */
  async setCustomRpc(
    rpcTarget,
    chainId,
    ticker = 'ETH',
    nickname = '',
    rpcPrefs = {},
  ) {
    const frequentRpcListDetail =
      this.preferencesController.getFrequentRpcListDetail();
    const rpcSettings = frequentRpcListDetail.find(
      (rpc) => rpcTarget === rpc.rpcUrl,
    );

    if (rpcSettings) {
      this.networkController.setRpcTarget(
        rpcSettings.rpcUrl,
        rpcSettings.chainId,
        rpcSettings.ticker,
        rpcSettings.nickname,
        rpcPrefs,
      );
    } else {
      this.networkController.setRpcTarget(
        rpcTarget,
        chainId,
        ticker,
        nickname,
        rpcPrefs,
      );
      await this.preferencesController.addToFrequentRpcList(
        rpcTarget,
        chainId,
        ticker,
        nickname,
        rpcPrefs,
      );
    }
    return rpcTarget;
  }

  /**
   * A method for deleting a selected custom URL.
   *
   * @param {string} rpcTarget - A RPC URL to delete.
   */
  async delCustomRpc(rpcTarget) {
    await this.preferencesController.removeFromFrequentRpcList(rpcTarget);
  }

  /**
   * Locks ecf-wallet
   *
   * @returns {Promise<object>} The keyring controller's memory state.
   */
  setLocked() {
    return this.keyringController.setLocked();
  }
}
