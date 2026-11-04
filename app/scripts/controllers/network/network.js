import EthQuery from '@metamask/eth-query';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { ComposedStore, ObservableStore } from '@metamask/obs-store';
import {
  createSwappableProxy,
  createEventEmitterProxy,
} from '@metamask/swappable-obj-proxy';
import assert from 'assert';
import EventEmitter from 'events';
import log from 'loglevel';

import { normalizeChainId } from './chain-utils';
import createBuiltInClient from './createBuiltInClient';
import createEcfWalletMiddleware from './createEcfWalletMiddleware';
import createJsonRpcClient from './createJsonRpcClient';
import createLocalhostClient from './createLocalhostClient';
import {
  SEPOLIA,
  MAINNET,
  LOCALHOST,
  LOCALHOST_CHAIN_ID,
  BUILT_IN_NETWORKS,
  BUILT_IN_NETWORK_TYPES,
} from './enums';
import providerFromEngine from './provider-from-engine';

const networks = { networkList: {} };

const env = process.env.ECF_WALLET_ENV;
const inTest = process.env.IN_TEST === 'true';

let defaultProviderConfigType;
if (inTest) {
  defaultProviderConfigType = LOCALHOST;
} else if (process.env.ECF_WALLET_DEBUG || env === 'test') {
  defaultProviderConfigType = SEPOLIA;
} else {
  defaultProviderConfigType = MAINNET;
}

const defaultProviderConfig = {
  type: defaultProviderConfigType,
};

// How long to wait before looking the network up again after it could not be
// reached, doubling after each failure up to the maximum. The wallet stays
// usable while it waits, and without this it would only learn that the
// network came back when the user switched networks.
const LOOKUP_RETRY_MIN_MS = 5000;
const LOOKUP_RETRY_MAX_MS = 60000;

const defaultNetworkConfig = {
  ticker: 'ETH',
};

export default class NetworkController extends EventEmitter {
  constructor(opts = {}) {
    super();

    // parse options
    const providerConfig = opts.provider || defaultProviderConfig;
    // create stores
    this.providerStore = new ObservableStore(providerConfig);
    this.networkStore = new ObservableStore('loading');
    this.networkConfig = new ObservableStore(defaultNetworkConfig);
    this.store = new ComposedStore({
      provider: this.providerStore,
      network: this.networkStore,
      settings: this.networkConfig,
    });
    this.on('networkDidChange', this.lookupNetwork);
    // provider and block tracker
    this._provider = null;
    this._blockTracker = null;
    // provider and block tracker proxies - because the network changes
    this._providerProxy = null;
    this._blockTrackerProxy = null;
    // network lookups, so only the latest one's answer is used
    this._lookupId = 0;
    this._lookupRetryTimer = null;
    this._lookupRetryDelay = LOOKUP_RETRY_MIN_MS;
  }

  initializeProvider(providerParams) {
    this._baseProviderParams = providerParams;
    const { type, rpcTarget, chainId, ticker, nickname } =
      this.providerStore.getState();
    this._configureProvider({ type, rpcTarget, chainId, ticker, nickname });
    this.lookupNetwork();
  }

  // return the proxies so the references will always be good
  getProviderAndBlockTracker() {
    const provider = this._providerProxy;
    const blockTracker = this._blockTrackerProxy;
    return { provider, blockTracker };
  }

  getNetworkState() {
    return this.networkStore.getState();
  }

  getChainId() {
    return this._chainId;
  }

  setNetworkState(network, type) {
    if (network === 'loading') {
      this.networkStore.putState(network);
      return;
    }

    // type must be defined
    if (!type) {
      return;
    }
    this.networkStore.putState(networks.networkList[type]?.chainId || network);
  }

  isNetworkLoading() {
    return this.getNetworkState() === 'loading';
  }

  lookupNetwork() {
    // Prevent firing when provider is not defined.
    if (!this._provider) {
      log.warn(
        'NetworkController - lookupNetwork aborted due to missing provider',
      );
      return;
    }
    this._clearLookupRetry();
    this._lookupId += 1;
    const lookupId = this._lookupId;
    const { type } = this.providerStore.getState();
    const provider = this._provider;
    const isCurrent = () =>
      provider === this._provider && lookupId === this._lookupId;
    const ethQuery = new EthQuery(provider);
    ethQuery.sendAsync({ method: 'net_version' }, (error, network) => {
      if (!isCurrent()) {
        return;
      }
      if (error) {
        this._lookupFailed();
        return;
      }
      ethQuery.sendAsync({ method: 'eth_chainId' }, (chainError, chainId) => {
        if (!isCurrent()) {
          return;
        }
        if (
          chainError ||
          typeof chainId !== 'string' ||
          !/^0x[0-9a-f]+$/iu.test(chainId)
        ) {
          this._lookupFailed();
          return;
        }
        // An RPC that reports a different chain than the one configured
        // could get transactions signed for the wrong chain, such as a local
        // fork of mainnet. Refuse to use it, and refuse a custom RPC with no
        // configured chain, since its RPC would then pick the chain that
        // transactions are signed for.
        const expectedChainId =
          type === LOCALHOST
            ? LOCALHOST_CHAIN_ID
            : this.providerStore.getState().chainId;
        if (
          (type === 'rpc' || type === LOCALHOST) &&
          (!normalizeChainId(expectedChainId) ||
            normalizeChainId(expectedChainId) !== normalizeChainId(chainId))
        ) {
          log.warn(
            `NetworkController - RPC returned chain ID ${chainId}, expected ${expectedChainId}`,
          );
          this._lookupFailed();
          return;
        }
        this._lookupRetryDelay = LOOKUP_RETRY_MIN_MS;
        this._chainId = chainId;
        this.setNetworkState(network, type);
      });
    });
  }

  setRpcTarget(rpcTarget, chainId, ticker = 'ETH', nickname = '', rpcPrefs) {
    assert(
      normalizeChainId(chainId),
      `NetworkController - a custom RPC needs a valid chain ID, got "${chainId}"`,
    );
    const providerConfig = {
      type: 'rpc',
      rpcTarget,
      chainId,
      ticker,
      nickname,
      rpcPrefs,
    };
    this.providerConfig = providerConfig;
  }

  async setProviderType(type, rpcTarget = '', ticker = 'ETH', nickname = '') {
    assert.notEqual(
      type,
      'rpc',
      `NetworkController - cannot call "setProviderType" with type 'rpc'. use "setRpcTarget"`,
    );
    assert(
      BUILT_IN_NETWORK_TYPES.includes(type) || (inTest && type === LOCALHOST),
      `NetworkController - Unknown rpc type "${type}"`,
    );
    const providerConfig = {
      type,
      rpcTarget,
      ticker: BUILT_IN_NETWORKS[type]?.ticker || ticker,
      nickname,
    };
    this.providerConfig = providerConfig;
  }

  set providerConfig(providerConfig) {
    this.providerStore.updateState(providerConfig);
    this._switchNetwork(providerConfig);
  }

  getProviderConfig() {
    return this.providerStore.getState();
  }

  //
  // Private
  //

  /**
   * Marks the network unreachable and looks it up again later. The chain ID is
   * cleared so nothing is signed for a chain that could not be confirmed.
   */
  _lookupFailed() {
    this._chainId = undefined;
    this.setNetworkState('loading');
    const delay = this._lookupRetryDelay;
    this._lookupRetryDelay = Math.min(delay * 2, LOOKUP_RETRY_MAX_MS);
    this._lookupRetryTimer = setTimeout(() => {
      this._lookupRetryTimer = null;
      this.lookupNetwork();
    }, delay);
  }

  _clearLookupRetry() {
    if (this._lookupRetryTimer) {
      clearTimeout(this._lookupRetryTimer);
      this._lookupRetryTimer = null;
    }
  }

  _switchNetwork(opts) {
    this._lookupRetryDelay = LOOKUP_RETRY_MIN_MS;
    this.setNetworkState('loading');
    this._configureProvider(opts);
    this.emit('networkDidChange', opts.type);
  }

  _configureProvider(opts) {
    this._chainId = undefined;
    const { type, rpcTarget, chainId, ticker, nickname } = opts;
    // built-in networks
    if (BUILT_IN_NETWORK_TYPES.includes(type)) {
      this._configureBuiltInProvider(opts);
      // other type-based rpc endpoints
    } else if (type === LOCALHOST) {
      this._configureLocalhostProvider();
      // url-based rpc endpoints
    } else if (type === 'rpc') {
      this._configureStandardProvider({
        rpcUrl: rpcTarget,
        chainId,
        ticker,
        nickname,
      });
    } else {
      throw new Error(
        `NetworkController - _configureProvider - unknown type "${type}"`,
      );
    }
  }

  _configureBuiltInProvider({ type }) {
    log.info('NetworkController - configureBuiltInProvider', type);
    const networkClient = createBuiltInClient({
      network: type,
    });
    this._setNetworkClient(networkClient);
    // setup networkConfig
    const settings = {
      ticker: BUILT_IN_NETWORKS[type].ticker,
    };
    this.networkConfig.putState(settings);
  }

  _configureLocalhostProvider() {
    log.info('NetworkController - configureLocalhostProvider');
    const networkClient = createLocalhostClient();
    this._setNetworkClient(networkClient);
  }

  _configureStandardProvider({ rpcUrl, chainId, ticker, nickname }) {
    log.info('NetworkController - configureStandardProvider', rpcUrl);
    const networkClient = createJsonRpcClient({ rpcUrl });
    // hack to add a 'rpc' network with chainId
    networks.networkList.rpc = {
      chainId,
      rpcUrl,
      ticker: ticker || 'ETH',
      nickname,
    };
    // setup networkConfig
    let settings = {
      network: chainId,
    };
    settings = Object.assign(settings, networks.networkList.rpc);
    this.networkConfig.putState(settings);
    this._setNetworkClient(networkClient);
  }

  _setNetworkClient({ networkMiddleware, blockTracker }) {
    const ecfWalletMiddleware = createEcfWalletMiddleware({
      ...this._baseProviderParams,
      getChainId: () => this.getChainId(),
    });
    const engine = new JsonRpcEngine();
    engine.push(ecfWalletMiddleware);
    engine.push(networkMiddleware);
    const provider = providerFromEngine(engine);
    this._setProviderAndBlockTracker({ provider, blockTracker });
  }

  _setProviderAndBlockTracker({ provider, blockTracker }) {
    // update or intialize proxies
    if (this._providerProxy) {
      this._providerProxy.setTarget(provider);
    } else {
      this._providerProxy = createSwappableProxy(provider);
    }
    if (this._blockTrackerProxy) {
      this._blockTrackerProxy.setTarget(blockTracker);
    } else {
      this._blockTrackerProxy = createEventEmitterProxy(blockTracker, {
        eventFilter: 'skipInternal',
      });
    }
    // set new provider and blockTracker
    this._provider = provider;
    this._blockTracker = blockTracker;
  }
}
