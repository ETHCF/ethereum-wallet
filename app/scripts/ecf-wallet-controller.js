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
import Dnode from 'dnode';
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
import createMethodBlockMiddleware from './lib/createMethodBlockMiddleware';
import createOnboardingMiddleware from './lib/createOnboardingMiddleware';
import createOriginMiddleware from './lib/createOriginMiddleware';
import createTabIdMiddleware from './lib/createTabIdMiddleware';
import DecryptMessageManager from './lib/decrypt-message-manager';
import EncryptionPublicKeyManager from './lib/encryption-public-key-manager';
import extension from './lib/extension-api';
import {
  Trezor as TrezorKeyring,
  Ledger as LedgerBridgeKeyring,
} from './lib/hardware-keyrings';
import { createAddressBookController } from './lib/modern-controllers-implementation';
import KeyringController from './lib/modern-keyring-controller';
import nodeify from './lib/nodeify';
import OriginThrottler from './lib/origin-throttler';
import PersonalMessageManager from './lib/personal-message-manager';
import PhishingWarnings from './lib/phishing-warnings';
import { getTypedDataAlerts } from './lib/security-checks';
import seedPhraseVerifier from './lib/seed-phrase-verifier';
import selectChainId from './lib/select-chain-id';
import { mnemonicToString } from './lib/software-keyrings';
import { isPrematureClose, setupMultiplex } from './lib/stream-utils';
import TypedMessageManager from './lib/typed-message-manager';

/**
 * The origin of another extension that connects to the wallet.
 *
 * @param {object} sender - The connecting extension's MessageSender.
 * @returns {string} Its origin, such as chrome-extension://<id>.
 */
export function externalExtensionOrigin(sender) {
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
    this.recordFirstTimeInfo(initState);

    // this keeps track of how many "controllerStream" connections are open
    // the only thing that uses controller connections are open ecf-wallet UI instances
    this.activeControllerConnections = 0;

    this.getRequestAccountTabIds = opts.getRequestAccountTabIds;
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
      openPopup: opts.openPopup,
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
    this.provider =
      this.networkController.getProviderAndBlockTracker().provider;
    this.blockTracker =
      this.networkController.getProviderAndBlockTracker().blockTracker;

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

    // start and stop polling for balances based on activeControllerConnections
    this.on('controllerConnectionChanged', (activeControllerConnections) => {
      if (activeControllerConnections > 0) {
        this.accountTracker.start();
      } else {
        this.accountTracker.stop();
      }
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
      initState:
        initState.TransactionController || initState.TransactionManager,
      getPermittedAccounts: this.permissionsController.getAccounts.bind(
        this.permissionsController,
      ),
      networkStore: this.networkController.networkStore,
      getChainId: () => this.networkController.getChainId(),
      preferencesStore: this.preferencesController.store,
      txHistoryLimit: 40,
      getNetwork: this.networkController.getNetworkState.bind(this),
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
      networkController: this.networkController,
    });

    this.store.updateStructure({
      AppStateController: this.appStateController.store,
      TransactionController: this.txController.store,
      KeyringController: this.keyringController.store,
      PreferencesController: this.preferencesController.store,
      AddressBookController: this.addressBookStore,
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
      AddressBookController: this.addressBookStore,
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
   * Constructor helper: initialize a provider.
   *
   * @returns {void} Nothing; the network controller holds the provider.
   */
  initializeProvider() {
    const version = this.platform.getVersion();
    const providerOpts = {
      static: {
        eth_syncing: false,
        web3_clientVersion: `ecf-wallet/v${version}`,
      },
      version,
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
      processTypedMessageV3: this.newUnsignedTypedMessage.bind(this),
      processTypedMessageV4: this.newUnsignedTypedMessage.bind(this),
      processPersonalMessage: this.newUnsignedPersonalMessage.bind(this),
      processDecryptMessage: this.newRequestDecryptMessage.bind(this),
      processEncryptionPublicKey: this.newRequestEncryptionPublicKey.bind(this),
      getPendingNonce: this.getPendingNonce.bind(this),
      getPendingTransactionByHash: (hash) =>
        this.txController.getFilteredTxList({ hash, status: 'submitted' })[0],
    };
    const providerProxy =
      this.networkController.initializeProvider(providerOpts);
    return providerProxy;
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
    const isUnlocked = this.isUnlocked();
    return {
      isUnlocked,
      ...networkState,
      accounts: isUnlocked
        ? await this.permissionsController.getAccounts(origin)
        : [],
    };
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
   * The ecf-wallet-state of the various controllers, made available to the UI
   *
   * @returns {object} status
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
      setUseNonceField: this.setUseNonceField.bind(this),
      setUsePhishDetect: this.setUsePhishDetect.bind(this),
      setIpfsGateway: this.setIpfsGateway.bind(this),
      setFirstTimeFlowType: this.setFirstTimeFlowType.bind(this),
      setCurrentLocale: this.setCurrentLocale.bind(this),
      markPasswordForgotten: this.markPasswordForgotten.bind(this),
      unMarkPasswordForgotten: this.unMarkPasswordForgotten.bind(this),
      getRequestAccountTabIds: (cb) => cb(null, this.getRequestAccountTabIds()),
      getOpenEcfWalletTabsIds: (cb) => cb(null, this.getOpenEcfWalletTabsIds()),

      // primary HD keyring management
      addNewAccount: nodeify(this.addNewAccount, this),
      verifySeedPhrase: nodeify(this.verifySeedPhrase, this),
      getSeedPhrase: nodeify(this.getSeedPhrase, this),
      resetAccount: nodeify(this.resetAccount, this),
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
      verifyPassword: nodeify(this.verifyPassword, this),
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
      removeSuggestedTokens: nodeify(
        preferencesController.removeSuggestedTokens,
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
      removeFromAddressBook: this.addressBookController.delete.bind(
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
      setConnectedStatusPopoverHasBeenShown: nodeify(
        this.appStateController.setConnectedStatusPopoverHasBeenShown,
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
      getFilteredTxList: nodeify(txController.getFilteredTxList, txController),
      isNonceTaken: nodeify(txController.isNonceTaken, txController),
      estimateGas: nodeify(this.estimateGas, this),
      getPendingNonce: nodeify(this.getPendingNonce, this),
      getNextNonce: nodeify(this.getNextNonce, this),

      // personalMessageManager
      signPersonalMessage: nodeify(this.signPersonalMessage, this),
      cancelPersonalMessage: this.cancelPersonalMessage.bind(this),

      // typedMessageManager
      signTypedMessage: nodeify(this.signTypedMessage, this),
      cancelTypedMessage: this.cancelTypedMessage.bind(this),

      // decryptMessageManager
      decryptMessage: nodeify(this.decryptMessage, this),
      decryptMessageInline: nodeify(this.decryptMessageInline, this),
      cancelDecryptMessage: this.cancelDecryptMessage.bind(this),

      // EncryptionPublicKeyManager
      encryptionPublicKey: nodeify(this.encryptionPublicKey, this),
      cancelEncryptionPublicKey: this.cancelEncryptionPublicKey.bind(this),

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
      clearPermissions: permissionsController.clearPermissions.bind(
        permissionsController,
      ),
      getApprovedAccounts: nodeify(
        permissionsController.getAccounts,
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

      const primaryKeyring =
        keyringController.getKeyringsByType('HD Key Tree')[0];
      if (!primaryKeyring) {
        throw new Error('EcfWalletController - No HD Key Tree found');
      }

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
   * check must not block the request, so errors yield no alerts.
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
      return [];
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
   * Submits a user's password to check its validity.
   *
   * @param {string} password - The user's password
   */
  async verifyPassword(password) {
    await this.keyringController.verifyPassword(password);
  }

  /**
   * Clears the clipboard after a delay, once a secret has been copied.
   */
  async scheduleClipboardClear() {
    if (this.opts.clipboardCleaner) {
      this.opts.clipboardCleaner.schedule();
    }
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
   * Fetch account list from a trezor device.
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
   * Clear
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
   * Imports an account from a trezor device.
   *
   * @param {number|string} index - The index of the account on the device.
   * @param {string} deviceName - The device type: 'trezor' or 'ledger'.
   * @param {string} [hdPath] - The HD path to derive accounts at.
   * @returns {Promise<object>} keyState
   */
  async unlockHardwareWalletAccount(index, deviceName, hdPath) {
    const keyring = await this.getKeyringForDevice(deviceName, hdPath);

    keyring.setAccountToUnlock(index);
    const oldAccounts = await this.keyringController.getAccounts();
    const keyState = await this.keyringController.addNewAccount(keyring);
    const newAccounts = await this.keyringController.getAccounts();
    this.preferencesController.setAddresses(newAccounts);
    newAccounts.forEach((address) => {
      if (!oldAccounts.includes(address)) {
        // Set the account label to Trezor 1 /  Ledger 1, etc
        this.preferencesController.setAccountLabel(
          address,
          `${deviceName[0].toUpperCase()}${deviceName.slice(1)} ${parseInt(index, 10) + 1}`,
        );
        // Select the account
        this.preferencesController.setSelectedAddress(address);
      }
    });

    const { identities } = this.preferencesController.store.getState();
    return { ...keyState, identities };
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
    const primaryKeyring =
      this.keyringController.getKeyringsByType('HD Key Tree')[0];
    if (!primaryKeyring) {
      throw new Error('EcfWalletController - No HD Key Tree found');
    }
    const { keyringController } = this;
    const oldAccounts = await keyringController.getAccounts();
    const keyState = await keyringController.addNewAccount(primaryKeyring);
    const newAccounts = await keyringController.getAccounts();

    await this.verifySeedPhrase();

    this.preferencesController.setAddresses(newAccounts);
    newAccounts.forEach((address) => {
      if (!oldAccounts.includes(address)) {
        this.preferencesController.setSelectedAddress(address);
      }
    });

    const { identities } = this.preferencesController.store.getState();
    return { ...keyState, identities };
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
    await this.keyringController.verifyPassword(password);
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
    await this.keyringController.verifyPassword(password);
    return this.keyringController.exportAccount(address);
  }

  /**
   * Reads the seed phrase and checks that it restores the vault's accounts.
   *
   * @returns {Promise<string>} The verified seed phrase.
   */
  async _getVerifiedSeedPhrase() {
    const primaryKeyring =
      this.keyringController.getKeyringsByType('HD Key Tree')[0];
    if (!primaryKeyring) {
      throw new Error('EcfWalletController - No HD Key Tree found');
    }

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
   * Clears the transaction history, to allow users to force-reset their nonces.
   * Mostly used in development environments, when networks are restarted with
   * the same network ID.
   *
   * @returns {Promise<string>} The current selected address.
   */
  async resetAccount() {
    const selectedAddress = this.preferencesController.getSelectedAddress();
    this.txController.wipeTransactions(selectedAddress);
    this.networkController.resetConnection();

    return selectedAddress;
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

  // personal_sign methods:

  /**
   * Called when a dapp uses the personal_sign method.
   * This is identical to the Geth eth_sign method, and may eventually replace
   * eth_sign.
   *
   * We currently define our eth_sign and personal_sign mostly for legacy Dapps.
   *
   * @param {object} msgParams - The params of the message to sign & return to the Dapp.
   * @param {object} req - (optional) the original request, containing the origin
   * @returns {Promise<string>} The signature, passed back to the requesting Dapp.
   */
  async newUnsignedPersonalMessage(msgParams, req) {
    const promise = this.personalMessageManager.addUnapprovedMessageAsync(
      msgParams,
      req,
    );
    this.sendUpdate();
    this.opts.showUnconfirmedMessage();
    return promise;
  }

  /**
   * Signifies a user's approval to sign a personal_sign message in queue.
   * Triggers signing, and the callback function from newUnsignedPersonalMessage.
   *
   * @param {object} msgParams - The params of the message to sign & return to the Dapp.
   * @returns {Promise<object>} A full state update.
   */
  signPersonalMessage(msgParams) {
    log.info('EcfWalletController - signPersonalMessage');
    const msgId = msgParams.ecfWalletId;
    // sets the status op the message to 'approved'
    // and removes the ecfWalletId for signing
    return this.personalMessageManager
      .approveMessage(msgParams)
      .then((cleanMsgParams) => {
        // signs the message
        return this.keyringController.signPersonalMessage(cleanMsgParams);
      })
      .then((rawSig) => {
        // tells the listener that the message has been signed
        // and can be returned to the dapp
        this.personalMessageManager.setMsgStatusSigned(msgId, rawSig);
        return this.getState();
      });
  }

  /**
   * Used to cancel a personal_sign type message.
   *
   * @param {string} msgId - The ID of the message to cancel.
   * @param {Function} cb - The callback function called with a full state update.
   */
  cancelPersonalMessage(msgId, cb) {
    const messageManager = this.personalMessageManager;
    messageManager.rejectMsg(msgId);
    if (!cb || typeof cb !== 'function') {
      return;
    }
    cb(null, this.getState());
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
    const promise = this.decryptMessageManager.addUnapprovedMessageAsync(
      msgParams,
      req,
    );
    this.sendUpdate();
    this.opts.showUnconfirmedMessage();
    return promise;
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
      const stripped = ethUtil.stripHexPrefix(msgParams.data);
      const buff = Buffer.from(stripped, 'hex');
      msgParams.data = JSON.parse(buff.toString('utf8'));

      msg.rawData = await this.keyringController.decryptMessage(msgParams);
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
    // sets the status op the message to 'approved'
    // and removes the ecfWalletId for decryption
    try {
      const cleanMsgParams =
        await this.decryptMessageManager.approveMessage(msgParams);

      const stripped = ethUtil.stripHexPrefix(cleanMsgParams.data);
      const buff = Buffer.from(stripped, 'hex');
      cleanMsgParams.data = JSON.parse(buff.toString('utf8'));

      // decrypt the message
      const rawMess =
        await this.keyringController.decryptMessage(cleanMsgParams);
      // tells the listener that the message has been decrypted and can be returned to the dapp
      this.decryptMessageManager.setMsgStatusDecrypted(msgId, rawMess);
    } catch (error) {
      log.info('EcfWalletController - eth_decrypt failed.', error);
      this.decryptMessageManager.errorMessage(msgId, error);
    }
    return this.getState();
  }

  /**
   * Used to cancel a eth_decrypt type message.
   *
   * @param {string} msgId - The ID of the message to cancel.
   * @param {Function} cb - The callback function called with a full state update.
   */
  cancelDecryptMessage(msgId, cb) {
    const messageManager = this.decryptMessageManager;
    messageManager.rejectMsg(msgId);
    if (!cb || typeof cb !== 'function') {
      return;
    }
    cb(null, this.getState());
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
    const promise = this.encryptionPublicKeyManager.addUnapprovedMessageAsync(
      msgParams,
      req,
    );
    this.sendUpdate();
    this.opts.showUnconfirmedMessage();
    return promise;
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
    // sets the status op the message to 'approved'
    // and removes the ecfWalletId for decryption
    try {
      const params =
        await this.encryptionPublicKeyManager.approveMessage(msgParams);

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

  /**
   * Used to cancel a eth_getEncryptionPublicKey type message.
   *
   * @param {string} msgId - The ID of the message to cancel.
   * @param {Function} cb - The callback function called with a full state update.
   */
  cancelEncryptionPublicKey(msgId, cb) {
    const messageManager = this.encryptionPublicKeyManager;
    messageManager.rejectMsg(msgId);
    if (!cb || typeof cb !== 'function') {
      return;
    }
    cb(null, this.getState());
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
    const securityAlerts = ['V3', 'V4'].includes(version)
      ? await this.getTypedDataAlerts(msgParams)
      : [];
    const promise = this.typedMessageManager.addUnapprovedMessageAsync(
      msgParams,
      req,
      version,
      securityAlerts,
    );
    this.sendUpdate();
    this.opts.showUnconfirmedMessage();
    return promise;
  }

  /**
   * The method for a user approving a call to eth_signTypedData, per EIP 712.
   * Triggers the callback in newUnsignedTypedMessage.
   *
   * @param {object} msgParams - The params passed to eth_signTypedData.
   * @returns {object | undefined} Full state update.
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
      this.typedMessageManager.errorMessage(msgId, error);
      return undefined;
    }
  }

  /**
   * Used to cancel a eth_signTypedData type message.
   *
   * @param {string} msgId - The ID of the message to cancel.
   * @param {Function} cb - The callback function called with a full state update.
   */
  cancelTypedMessage(msgId, cb) {
    const messageManager = this.typedMessageManager;
    messageManager.rejectMsg(msgId);
    if (!cb || typeof cb !== 'function') {
      return;
    }
    cb(null, this.getState());
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
  // PASSWORD MANAGEMENT
  //=============================================================================

  /**
   * Allows a user to begin the seed phrase recovery process.
   *
   * @param {Function} cb - A callback function called when complete.
   */
  markPasswordForgotten(cb) {
    this.preferencesController.setPasswordForgotten(true);
    this.sendUpdate();
    cb();
  }

  /**
   * Allows a user to end the seed phrase recovery process.
   *
   * @param {Function} cb - A callback function called when complete.
   */
  unMarkPasswordForgotten(cb) {
    this.preferencesController.setPasswordForgotten(false);
    this.sendUpdate();
    cb();
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
   * A method for providing our API over a stream using Dnode.
   *
   * @param {*} outStream - The stream to provide our API over.
   */
  setupControllerConnection(outStream) {
    const api = this.getApi();
    const dnode = Dnode(api);
    // report new active controller connection
    this.activeControllerConnections += 1;
    this.emit('controllerConnectionChanged', this.activeControllerConnections);
    // connect dnode api to remote connection
    pump(outStream, dnode, outStream, (err) => {
      // report new active controller connection
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
    dnode.on('remote', (remote) => {
      // push updates to popup
      const sendUpdate = (update) => remote.sendUpdate(update);
      this.on('update', sendUpdate);
      // remove update listener once the connection ends
      dnode.on('end', () => this.removeListener('update', sendUpdate));
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
      const accounts = this.isUnlocked()
        ? await this.permissionsController.getAccounts(origin)
        : [];
      const networkState = this.getProviderNetworkState();
      // Without a chain ID the provider would reject the update; one follows
      // from _onStateUpdate when the network reports it.
      if (networkState.chainId) {
        engine.emit('notification', {
          jsonrpc: '2.0',
          method: NOTIFICATION_NAMES.chainChanged,
          params: networkState,
        });
      }
      engine.emit('notification', {
        jsonrpc: '2.0',
        method: NOTIFICATION_NAMES.accountsChanged,
        params: accounts,
      });
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

    Object.values(connections).forEach((conn) => {
      conn.engine && conn.engine.emit('notification', payload);
    });
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

    Object.values(this.connections).forEach((origin) => {
      Object.values(origin).forEach((conn) => {
        conn.engine && conn.engine.emit('notification', payload);
      });
    });
  }

  /**
   * Unlocking shares each origin's permitted accounts with its providers again.
   */
  _onUnlock() {
    Object.entries(this.connections).forEach(([origin, connections]) => {
      Object.values(connections).forEach(
        ({ engine }) => engine && this._sendProviderState(origin, engine),
      );
    });
    this.emit('unlock');
  }

  /**
   * Locking hides all accounts from sites. This must reach every connection,
   * unlike notifications sent while unlocked.
   */
  _onLock() {
    Object.values(this.connections).forEach((connections) => {
      Object.values(connections).forEach(({ engine }) => {
        engine &&
          engine.emit('notification', {
            jsonrpc: '2.0',
            method: NOTIFICATION_NAMES.accountsChanged,
            params: [],
          });
      });
    });
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
    Object.values(this.connections).forEach((connections) => {
      Object.values(connections).forEach(({ engine }) => {
        engine &&
          engine.emit('notification', {
            jsonrpc: '2.0',
            method: NOTIFICATION_NAMES.chainChanged,
            params: networkState,
          });
      });
    });
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

  /**
   * Returns the next nonce according to the nonce-tracker
   *
   * @param {string} address - The hex string address for the transaction
   * @returns {Promise<number>} The next nonce.
   */
  async getNextNonce(address) {
    const nonceLock =
      await this.txController.nonceTracker.getNonceLock(address);
    try {
      return nonceLock.nextNonce;
    } finally {
      nonceLock.releaseLock();
    }
  }

  //=============================================================================
  // CONFIG
  //=============================================================================

  // Log blocks

  // network
  /**
   * A method for selecting a custom URL for an ethereum RPC provider and updating it
   *
   * @param {string} rpcUrl - A URL for a valid Ethereum RPC API.
   * @param {string} chainId - The chainId of the selected network.
   * @param {string} ticker - The ticker symbol of the selected network.
   * @param {string} nickname - Optional nickname of the selected network.
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
   * Sets whether or not to use the nonce field.
   *
   * @param {boolean} val - True for nonce field, false for not nonce field.
   * @param {Function} cb - A callback function called when complete.
   */
  setUseNonceField(val, cb) {
    try {
      this.preferencesController.setUseNonceField(val);
      cb(null);
      // eslint-disable-next-line no-useless-return
      return;
    } catch (err) {
      cb(err);
      // eslint-disable-next-line no-useless-return
      return;
    }
  }

  /**
   * Sets whether or not to use phishing detection.
   *
   * @param {boolean} val - Whether to use phishing detection.
   * @param {Function} cb - A node style callback, called with an error if one occurs.
   */
  setUsePhishDetect(val, cb) {
    try {
      this.preferencesController.setUsePhishDetect(val);
      cb(null);
      // eslint-disable-next-line no-useless-return
      return;
    } catch (err) {
      cb(err);
      // eslint-disable-next-line no-useless-return
      return;
    }
  }

  /**
   * Sets the IPFS gateway to use for ENS content resolution.
   *
   * @param {string} val - the host of the gateway to set
   * @param {Function} cb - A callback function called when complete.
   */
  setIpfsGateway(val, cb) {
    try {
      this.preferencesController.setIpfsGateway(val);
      cb(null);
      // eslint-disable-next-line no-useless-return
      return;
    } catch (err) {
      cb(err);
      // eslint-disable-next-line no-useless-return
      return;
    }
  }

  /**
   * Sets the type of first time flow the user wishes to follow: create or import
   *
   * @param {string} type - Indicates the type of first time flow the user wishes to follow
   * @param {Function} cb - A callback function called when complete.
   */
  setFirstTimeFlowType(type, cb) {
    try {
      this.preferencesController.setFirstTimeFlowType(type);
      cb(null);
      // eslint-disable-next-line no-useless-return
      return;
    } catch (err) {
      cb(err);
      // eslint-disable-next-line no-useless-return
      return;
    }
  }

  /**
   * A method for setting a user's current locale, affecting the language rendered.
   *
   * @param {string} key - Locale identifier.
   * @param {Function} cb - A callback function called when complete.
   */
  setCurrentLocale(key, cb) {
    try {
      const direction = this.preferencesController.setCurrentLocale(key);
      cb(null, direction);
      // eslint-disable-next-line no-useless-return
      return;
    } catch (err) {
      cb(err);
      // eslint-disable-next-line no-useless-return
      return;
    }
  }

  /**
   * A method for initializing storage the first time.
   *
   * @param {object} initState - The default state to initialize with.
   * @private
   */
  recordFirstTimeInfo(initState) {
    if (!Object.hasOwn(initState, 'firstTimeInfo')) {
      const version = this.platform.getVersion();
      initState.firstTimeInfo = {
        version,
        date: Date.now(),
      };
    }
  }

  // TODO: Replace isClientOpen methods with `controllerConnectionChanged` events.
  /**
   * A method for recording whether the ecf-wallet user interface is open or not.
   *
   * @private
   * @param {boolean} open - Whether the user interface is open.
   */
  set isClientOpen(open) {
    this._isClientOpen = open;
    this.detectTokensController.isOpen = open;
  }

  /**
   * Creates RPC engine middleware for processing eth_signTypedData requests
   *
   * @param {object} req - request object
   * @param {object} res - response object
   * @param {Function} next - next
   * @param {Function} end - end
   */

  /**
   * Locks ecf-wallet
   *
   * @returns {Promise<object>} The keyring controller's memory state.
   */
  setLocked() {
    return this.keyringController.setLocked();
  }
}
