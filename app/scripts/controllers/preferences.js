import { isValidAddress } from '@ethereumjs/util';
import EthQuery from '@metamask/eth-query';
import { ObservableStore } from '@metamask/obs-store';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { nanoid } from 'nanoid';
import pify from 'pify';

import { normalizeChainId, UNSAFE_TEXT } from './network/chain-utils';
import { BUILT_IN_NETWORKS, LOCALHOST_CHAIN_ID } from './network/enums';
import { addInternalMethodPrefix } from './permissions';
import ApprovalQueue from '../lib/approval-queue';
import { callContract } from '../lib/contract-call';
import {
  fetchImageAsDataUrl,
  isImageDataUrl,
  MAX_IMAGE_BYTES,
} from '../lib/remote-image';
import { normalizeAddress } from '../lib/util';

// A data URL of an image no larger than a downloaded one may be.
const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;

/**
 * Resolves a provider configuration to the chain it is allowed to access.
 *
 * @param {object} provider - The selected provider configuration.
 * @returns {string|undefined} Its canonical chain ID.
 */
function tokenChainId(provider) {
  return (
    BUILT_IN_NETWORKS[provider.type]?.chainId ||
    (provider.type === 'localhost'
      ? LOCALHOST_CHAIN_ID
      : normalizeChainId(provider.chainId))
  );
}

/**
 * Upgrades the old provider-type buckets. The shared rpc bucket has no
 * trustworthy chain identity, so it must not supply confirmation metadata.
 * This is also applied on restore; saved active projections are never trusted.
 *
 * @param {object} accounts - Saved account token lists.
 * @returns {object} Token lists keyed by account and canonical chain ID.
 */
function migrateAccountTokens(accounts) {
  return Object.fromEntries(
    Object.entries(accounts).map(([account, networks]) => {
      const chains = {};
      for (const [key, tokens] of Object.entries(networks)) {
        const chainId =
          BUILT_IN_NETWORKS[key]?.chainId || normalizeChainId(key);
        if (
          chainId &&
          Array.isArray(tokens) &&
          (!chains[chainId] || key === chainId)
        ) {
          chains[chainId] = tokens;
        }
      }
      return [account, chains];
    }),
  );
}

/**
 * Keeps only bounded data URLs in images already scoped to an account/chain.
 * Legacy unscoped images cannot be assigned to a chain safely.
 *
 * @param {object} accounts - Saved scoped images.
 * @returns {object} Safe images keyed by account, chain, and token address.
 */
function sanitizeAccountAssetImages(accounts) {
  return Object.fromEntries(
    Object.entries(accounts).map(([account, networks]) => [
      account,
      Object.fromEntries(
        Object.entries(networks)
          .filter(([chainId]) => normalizeChainId(chainId) === chainId)
          .map(([chainId, images]) => [
            chainId,
            Object.fromEntries(
              Object.entries(images).filter(
                ([, image]) =>
                  isImageDataUrl(image) &&
                  image.length <= MAX_IMAGE_DATA_URL_LENGTH,
              ),
            ),
          ]),
      ),
    ]),
  );
}

/**
 * Refuses a custom RPC without a usable chain ID. Without one, the RPC itself
 * would choose the chain that transactions and typed data are signed for.
 *
 * @param {string} chainId - The chain ID entered for the network
 * @throws {Error} If the chain ID is missing or invalid
 */
function assertCustomRpcChainId(chainId) {
  if (!normalizeChainId(chainId)) {
    throw new Error(`A custom RPC needs a valid chain ID, got "${chainId}"`);
  }
}

export default class PreferencesController {
  /**
   * Creates a PreferencesController.
   *
   * @typedef {object} PreferencesController
   * @param {object} opts - Overrides the defaults for the initial state of this.store
   * @property {object} store The stored object containing a users preferences, stored in local storage
   * @property {Array} store.frequentRpcListDetail A list of custom rpcs to provide the user
   * @property {Array} store.tokens The tokens the user wants display in their token lists
   * @property {object} store.accountTokens The tokens stored per account and then per chain ID
   * @property {object} store.accountAssetImages Token images stored per account and chain ID
   * @property {object} store.assetImages Token images for the active account and chain
   * @property {object} store.featureFlags A key-boolean map, where keys refer to features and booleans to whether the
   * user wishes to see that feature.
   *
   * Feature flags can be set by the global function `setPreference(feature, enabled)`, and so should not expose any sensitive behavior.
   * @property {object} store.knownMethodData Contains all data methods known by the user
   * @property {string} store.currentLocale The preferred language locale key
   * @property {string} store.selectedAddress A hex string that matches the currently selected address in the app
   */
  constructor(opts = {}) {
    const initState = {
      frequentRpcListDetail: [],
      accountTokens: {},
      accountAssetImages: {},
      assetImages: {},
      tokens: [],
      usePhishDetect: true,
      // Whether to check jsDelivr for a newer phishing list. Turned off, the
      // wallet keeps checking sites against the list it already has.
      updatePhishingList: true,
      // Whether to look up unknown contract methods at 4byte.directory.
      use4ByteResolution: true,
      // Whether closing the approval window refuses the requests in it, as
      // upstream does, rather than leaving them waiting for the user.
      rejectRequestsOnClose: true,
      // Whether to ask the NFT API for the selected account's NFTs, and
      // whether to download their images. Both contact third parties, so
      // both are off until the user turns them on.
      useNftDetection: false,
      displayNftMedia: false,

      // WARNING: Do not use feature flags for security-sensitive things.
      // Feature flag toggling is available in the global namespace
      // for convenient testing of pre-release features, and should never
      // perform sensitive operations.
      featureFlags: {},
      knownMethodData: {},
      firstTimeFlowType: null,
      currentLocale: opts.initLangCode,
      identities: {},
      preferences: {
        autoLockTimeLimit: undefined,
        theme: 'os',
      },
      completedOnboarding: false,

      // ENS decentralized website resolution
      ipfsGateway: 'dweb.link',
      ...opts.initState,
    };
    // Earlier versions saved suggestions with the preferences.
    delete initState.suggestedTokens;
    initState.accountTokens = migrateAccountTokens(initState.accountTokens);
    initState.accountAssetImages = sanitizeAccountAssetImages(
      initState.accountAssetImages,
    );
    initState.tokens = [];
    initState.assetImages = {};

    this.network = opts.network;
    this.getProvider = opts.getProvider;
    this.fetchImage = opts.fetchImage ?? fetchImageAsDataUrl;
    this.store = new ObservableStore(initState);
    this.store.setMaxListeners(12);
    // A suggestion belongs to a live wallet_watchAsset request, so, like
    // upstream's approvals, it is kept in memory only, keyed by request id.
    this.watchAssetStore = new ObservableStore({ suggestedTokens: {} });
    this._watchAssetRequests = new ApprovalQueue({
      label: 'token suggestion',
      onChange: () =>
        this.watchAssetStore.updateState({
          suggestedTokens: Object.fromEntries(
            this._watchAssetRequests
              .requests()
              .map((suggestion) => [suggestion.id, suggestion]),
          ),
        }),
    });
    this.showWatchAssetRequest = opts.showWatchAssetRequest;
    this._tokenContextVersion = 0;
    this._subscribeProviderType();
    this._updateTokens();

    global.setPreference = (key, value) => {
      return this.setFeatureFlag(key, value);
    };
  }
  // PUBLIC METHODS

  /**
   * Setter for the `usePhishDetect` property
   *
   * @param {boolean} val - Whether or not the user prefers phishing domain protection
   */
  setUsePhishDetect(val) {
    this.store.updateState({ usePhishDetect: val });
  }

  /**
   * Setter for the `updatePhishingList` property
   *
   * @param {boolean} val - Whether to download updates to the phishing list
   */
  setUpdatePhishingList(val) {
    this.store.updateState({ updatePhishingList: val });
  }

  /**
   * Setter for the `use4ByteResolution` property
   *
   * @param {boolean} val - Whether the user allows contract method names to
   * be looked up at 4byte.directory
   */
  setUse4ByteResolution(val) {
    this.store.updateState({ use4ByteResolution: val });
  }

  /**
   * Setter for the `rejectRequestsOnClose` property
   *
   * @param {boolean} val - Whether closing the approval window refuses the
   * requests in it
   */
  setRejectRequestsOnClose(val) {
    this.store.updateState({ rejectRequestsOnClose: val });
  }

  /**
   * Setter for the `useNftDetection` property
   *
   * @param {boolean} val - Whether the user allows the NFT API to be asked
   * for the selected account's NFTs
   */
  setUseNftDetection(val) {
    this.store.updateState({ useNftDetection: Boolean(val) });
  }

  /**
   * Setter for the `displayNftMedia` property
   *
   * @param {boolean} val - Whether the user allows NFT images to be downloaded
   */
  setDisplayNftMedia(val) {
    this.store.updateState({ displayNftMedia: Boolean(val) });
  }

  /**
   * Setter for the `firstTimeFlowType` property
   *
   * @param {string} type - Indicates the type of first time flow - create or import - the user wishes to follow
   */
  setFirstTimeFlowType(type) {
    this.store.updateState({ firstTimeFlowType: type });
  }

  getSuggestedTokens() {
    return this.watchAssetStore.getState().suggestedTokens;
  }

  getAssetImages() {
    return this.store.getState().assetImages;
  }

  /**
   * Add new methodData to state, to avoid looking this information up again
   *
   * @param {string} fourBytePrefix - Four-byte method signature
   * @param {string} methodData - Corresponding data method
   */
  addKnownMethodData(fourBytePrefix, methodData) {
    const { knownMethodData } = this.store.getState();
    knownMethodData[fourBytePrefix] = methodData;
    this.store.updateState({ knownMethodData });
  }

  /**
   * RPC engine middleware for requesting new asset added
   *
   * @param {object} req - The JSON-RPC request.
   * @param {object} res - The JSON-RPC response.
   * @param {Function} next - Passes the request to the next middleware.
   * @param {Function} end - Ends the request, optionally with an error.
   */
  async requestWatchAsset(req, res, next, end) {
    if (
      req.method !== 'ecf_wallet_watchAsset' &&
      req.method !== addInternalMethodPrefix('watchAsset')
    ) {
      next();
      return;
    }
    // The engine does not await middleware, so every path must end the request.
    try {
      const { type, options } = req.params ?? {};
      if (type !== 'ERC20') {
        throw rpcErrors.invalidParams(`Asset of type ${type} not supported`);
      }
      res.result = await this._handleWatchAssetERC20(options, req.origin);
      end();
    } catch (error) {
      end(error);
    }
  }

  /**
   * Setter for the `currentLocale` property
   *
   * @param {string} key - he preferred language locale key
   * @returns {string} The text direction for the locale: 'rtl' or 'auto'.
   */
  setCurrentLocale(key) {
    const textDirection = ['ar', 'dv', 'fa', 'he', 'ku'].includes(key)
      ? 'rtl'
      : 'auto';
    this.store.updateState({
      currentLocale: key,
      textDirection,
    });
    return textDirection;
  }

  /**
   * Updates identities to only include specified addresses. Removes identities
   * not included in addresses array
   *
   * @param {string[]} addresses - An array of hex addresses
   */
  setAddresses(addresses) {
    const oldIdentities = this.store.getState().identities;
    const oldAccountTokens = this.store.getState().accountTokens;
    const oldAccountImages = this.store.getState().accountAssetImages;

    const identities = addresses.reduce((ids, address, index) => {
      const oldId = oldIdentities[address] || {};
      ids[address] = { name: `Account ${index + 1}`, address, ...oldId };
      return ids;
    }, {});
    const accountTokens = addresses.reduce((tokens, address) => {
      const oldTokens = oldAccountTokens[address] || {};
      tokens[address] = oldTokens;
      return tokens;
    }, {});
    const accountAssetImages = Object.fromEntries(
      addresses.map((address) => [address, oldAccountImages[address] || {}]),
    );
    if (
      this.getSelectedAddress() &&
      !addresses.includes(this.getSelectedAddress())
    ) {
      this._invalidateTokenContext();
    }
    this.store.updateState({ identities, accountTokens, accountAssetImages });
    this._updateTokens();
  }

  /**
   * Removes an address from state
   *
   * @param {string} address - A hex address
   * @returns {string} the address that was removed
   */
  removeAddress(address) {
    const { identities } = this.store.getState();
    const { accountTokens, accountAssetImages } = this.store.getState();
    if (!identities[address]) {
      throw new Error(`${address} can't be deleted cause it was not found`);
    }
    delete identities[address];
    delete accountTokens[address];
    delete accountAssetImages[address];
    this.store.updateState({ identities, accountTokens, accountAssetImages });

    // If the selected account is no longer valid,
    // select an arbitrary other account:
    if (address === this.getSelectedAddress()) {
      const selected = Object.keys(identities)[0];
      this.setSelectedAddress(selected);
    }
    return address;
  }

  /**
   * Adds addresses to the identities object without removing identities
   *
   * @param {string[]} addresses - An array of hex addresses
   */
  addAddresses(addresses) {
    const { identities, accountTokens, accountAssetImages } =
      this.store.getState();
    addresses.forEach((address) => {
      // skip if already exists
      if (identities[address]) {
        return;
      }
      // add missing identity
      const identityCount = Object.keys(identities).length;

      accountTokens[address] = {};
      accountAssetImages[address] = {};
      identities[address] = { name: `Account ${identityCount + 1}`, address };
    });
    this.store.updateState({ identities, accountTokens, accountAssetImages });
  }

  /**
   * Synchronizes identity entries with known accounts.
   * Removes any unknown identities, and returns the resulting selected address.
   *
   * @param {Array<string>} addresses - known to the vault.
   * @returns {Promise<string>} selectedAddress the selected address.
   */
  syncAddresses(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Expected non-empty array of addresses.');
    }

    const { identities } = this.store.getState();

    Object.keys(identities).forEach((identity) => {
      if (!addresses.includes(identity)) {
        delete identities[identity];
      }
    });

    this.store.updateState({ identities });
    this.addAddresses(addresses);

    // If the selected account is no longer valid,
    // select an arbitrary other account:
    let selected = this.getSelectedAddress();
    if (!addresses.includes(selected)) {
      selected = addresses[0];
      this.setSelectedAddress(selected);
    }

    return selected;
  }

  /**
   * Adds a suggested token the user approved, downloading its image only
   * now, and answers the site's wallet_watchAsset request with true.
   *
   * @param {string} id - The suggestion's request id.
   * @returns {Promise<void>} Settles once the token is added, or rejects
   * with the error the site was also answered with.
   */
  acceptWatchAsset(id) {
    return this._watchAssetRequests.approve(
      id,
      async ({ request: suggestion, data }) => {
        this._assertTokenContext(data.context);
        const cachedImage = await this._cacheImage(data.image);
        this._assertTokenContext(data.context);
        await this.addToken(
          suggestion.address,
          suggestion.symbol,
          suggestion.decimals,
          cachedImage,
          data.context,
        );
        return true;
      },
    );
  }

  /**
   * Refuses a suggested token, answering the site's wallet_watchAsset request
   * with a user-rejected error, as upstream does.
   *
   * @param {string} id - The suggestion's request id.
   */
  rejectWatchAsset(id) {
    this._watchAssetRequests.reject(id);
  }

  /**
   * Refuses every pending suggested token, as upstream does with its
   * approvals when the user closes the notification window.
   */
  rejectPendingWatchAssets() {
    this._watchAssetRequests.rejectAll();
  }

  /**
   * Setter for the `selectedAddress` property
   *
   * @param {string} _address - A new hex address for an account
   * @returns {Promise<Array>} Promise resolves with tokens
   */
  setSelectedAddress(_address) {
    const address = normalizeAddress(_address);
    const { identities } = this.store.getState();
    const selectedIdentity = identities[address];
    if (!selectedIdentity) {
      throw new Error(`Identity for '${address} not found`);
    }

    if (address !== this.getSelectedAddress()) {
      this._invalidateTokenContext();
    }
    selectedIdentity.lastSelected = Date.now();
    const { tokens, assetImages } = this._getTokenRelatedStates(address);
    this.store.updateState({
      identities,
      selectedAddress: address,
      tokens,
      assetImages,
    });
    return Promise.resolve(tokens);
  }

  /**
   * Getter for the `selectedAddress` property
   *
   * @returns {string} The hex address for the currently selected account
   */
  getSelectedAddress() {
    return this.store.getState().selectedAddress;
  }

  /**
   * Contains data about tokens users add to their account.
   *
   * @typedef {object} AddedToken
   * @property {string} address - The hex address for the token contract. Will be all lower cased and hex-prefixed.
   * @property {string} symbol - The symbol of the token, usually 3 or 4 capitalized letters
   * {@link https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md#symbol}
   * @property {number} decimals - The number of decimals the token uses.
   * {@link https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md#decimals}
   */

  /**
   * Adds a new token to the token array, or updates the token if passed an address that already exists.
   * Modifies the existing tokens array from the store. All objects in the tokens array array AddedToken objects.
   *
   * @see AddedToken {@link AddedToken}
   *
   * @param {string} rawAddress - Hex address of the token contract. May or may not be a checksum address.
   * @param {string} symbol - The symbol of the token
   * @param {number} decimals - The number of decimals the token uses.
   * @param {string} [image] - The token's image as a data URL, stored in
   * assetImages. Any other value is dropped, so that the image never makes
   * the wallet contact a host.
   * @param {object} [context] - The context captured before asynchronous work.
   * @returns {Promise<Array>} Promises the new array of AddedToken objects.
   */
  async addToken(
    rawAddress,
    symbol,
    decimals,
    image,
    context = this.getTokenContext(),
  ) {
    const address = normalizeAddress(rawAddress);
    const newEntry = { address, symbol, decimals };
    this._assertTokenContext(context);
    const tokens = [...this.getTokens()];
    const assetImages = { ...this.getAssetImages() };
    const previousEntry = tokens.find((token) => {
      return token.address === address;
    });
    const previousIndex = tokens.indexOf(previousEntry);

    if (previousEntry) {
      tokens[previousIndex] = newEntry;
    } else {
      tokens.push(newEntry);
    }
    assetImages[address] = isImageDataUrl(image) ? image : undefined;
    this._updateAccountTokens(tokens, assetImages);
    return Promise.resolve(tokens);
  }

  /**
   * Removes a specified token from the tokens array.
   *
   * @param {string} rawAddress - Hex address of the token contract to remove.
   * @returns {Promise<Array>} The new array of AddedToken objects
   */
  removeToken(rawAddress) {
    const { tokens } = this.store.getState();
    const assetImages = { ...this.getAssetImages() };
    const updatedTokens = tokens.filter(
      (token) => token.address !== rawAddress,
    );
    delete assetImages[rawAddress];
    this._updateAccountTokens(updatedTokens, assetImages);
    return Promise.resolve(updatedTokens);
  }

  /**
   * A getter for the `tokens` property
   *
   * @returns {Array} The current array of AddedToken objects
   */
  getTokens() {
    return this.store.getState().tokens;
  }

  /**
   * Sets a custom label for an account
   *
   * @param {string} account - the account to set a label for
   * @param {string} label - the custom label for the account
   * @returns {Promise<string>} Resolves with the label.
   */
  setAccountLabel(account, label) {
    if (!account) {
      throw new Error(
        `setAccountLabel requires a valid address, got ${String(account)}`,
      );
    }
    const address = normalizeAddress(account);
    const { identities } = this.store.getState();
    identities[address] = identities[address] || {};
    identities[address].name = label;
    this.store.updateState({ identities });
    return Promise.resolve(label);
  }

  /**
   * updates custom RPC details, or adds them if the RPC url is new
   *
   * @param {object} newRpcDetails - The RPC details: rpcUrl, chainId (required
   * for a new RPC), and optionally ticker, nickname and rpcPrefs.
   * @returns {Promise<Array>} Promise resolving to updated frequentRpcListDetail.
   */

  updateRpc(newRpcDetails) {
    const rpcList = this.getFrequentRpcListDetail();
    const index = rpcList.findIndex((element) => {
      return element.rpcUrl === newRpcDetails.rpcUrl;
    });
    if (index > -1) {
      const rpcDetail = rpcList[index];
      const updatedRpc = { ...rpcDetail, ...newRpcDetails };
      assertCustomRpcChainId(updatedRpc.chainId);
      rpcList[index] = updatedRpc;
      this.store.updateState({ frequentRpcListDetail: rpcList });
    } else {
      const {
        rpcUrl,
        chainId,
        ticker,
        nickname,
        rpcPrefs = {},
      } = newRpcDetails;
      return this.addToFrequentRpcList(
        rpcUrl,
        chainId,
        ticker,
        nickname,
        rpcPrefs,
      );
    }
    return Promise.resolve(rpcList);
  }

  /**
   * Adds custom RPC url to state.
   *
   * @param {string} url - The RPC url to add to frequentRpcListDetail.
   * @param {string} chainId - The chainId of the network, which is required.
   * @param {string} ticker - Optional ticker symbol of the selected network.
   * @param {string} nickname - Optional nickname of the selected network.
   * @param {object} [rpcPrefs] - Optional preferences for the network, such
   * as blockExplorerUrl.
   * @returns {Promise<Array>} Promise resolving to updated frequentRpcListDetail.
   */
  addToFrequentRpcList(
    url,
    chainId,
    ticker = 'ETH',
    nickname = '',
    rpcPrefs = {},
  ) {
    assertCustomRpcChainId(chainId);
    const rpcList = this.getFrequentRpcListDetail();
    const index = rpcList.findIndex((element) => {
      return element.rpcUrl === url;
    });
    if (index !== -1) {
      rpcList.splice(index, 1);
    }
    rpcList.push({
      rpcUrl: url,
      chainId,
      ticker,
      nickname,
      rpcPrefs,
    });
    this.store.updateState({ frequentRpcListDetail: rpcList });
    return Promise.resolve(rpcList);
  }

  /**
   * Removes custom RPC url from state.
   *
   * @param {string} url - The RPC url to remove from frequentRpcListDetail.
   * @returns {Promise<Array>} Promise resolving to updated frequentRpcListDetail.
   */
  removeFromFrequentRpcList(url) {
    const rpcList = this.getFrequentRpcListDetail();
    const index = rpcList.findIndex((element) => {
      return element.rpcUrl === url;
    });
    if (index !== -1) {
      rpcList.splice(index, 1);
    }
    this.store.updateState({ frequentRpcListDetail: rpcList });
    return Promise.resolve(rpcList);
  }

  /**
   * Getter for the `frequentRpcListDetail` property.
   *
   * @returns {Array<object>} The custom RPC details.
   */
  getFrequentRpcListDetail() {
    return this.store.getState().frequentRpcListDetail;
  }

  /**
   * Updates the `featureFlags` property, which is an object. One property within that object will be set to a boolean.
   *
   * @param {string} feature - A key that corresponds to a UI feature.
   * @param {boolean} activated - Indicates whether or not the UI feature should be displayed
   * @returns {Promise<object>} Promises a new object; the updated featureFlags object.
   */
  setFeatureFlag(feature, activated) {
    const currentFeatureFlags = this.store.getState().featureFlags;
    const updatedFeatureFlags = {
      ...currentFeatureFlags,
      [feature]: activated,
    };

    this.store.updateState({ featureFlags: updatedFeatureFlags });

    return Promise.resolve(updatedFeatureFlags);
  }

  /**
   * Updates the `preferences` property, which is an object. These are user-controlled features
   * found in the settings page.
   *
   * @param {string} preference - The preference to enable or disable.
   * @param {boolean} value - Indicates whether or not the preference should be enabled or disabled.
   * @returns {Promise<object>} Promises a new object; the updated preferences object.
   */
  setPreference(preference, value) {
    const currentPreferences = this.getPreferences();
    const updatedPreferences = {
      ...currentPreferences,
      [preference]: value,
    };

    this.store.updateState({ preferences: updatedPreferences });
    return Promise.resolve(updatedPreferences);
  }

  /**
   * A getter for the `preferences` property
   *
   * @returns {object} A key-boolean map of user-selected preferences.
   */
  getPreferences() {
    return this.store.getState().preferences;
  }

  /**
   * Sets the completedOnboarding state to true, indicating that the user has completed the
   * onboarding process.
   *
   * @returns {Promise<boolean>} Resolves with true.
   */
  completeOnboarding() {
    this.store.updateState({ completedOnboarding: true });
    return Promise.resolve(true);
  }

  /**
   * A getter for the `ipfsGateway` property
   *
   * @returns {string} The current IPFS gateway domain
   */
  getIpfsGateway() {
    return this.store.getState().ipfsGateway;
  }

  //
  // PRIVATE METHODS
  //

  /**
   * Subscription to network provider type.
   *
   *
   */
  _subscribeProviderType() {
    this.network.providerStore.subscribe(() => {
      // Count transitions, including a switch away and back or a new RPC for
      // the same chain. Comparing only the final chain ID misses stale reads.
      this._invalidateTokenContext();
      this._updateTokens();
    });
  }

  /**
   * Updates `accountTokens` and `tokens` of current account and network according to it.
   *
   * @param {Array} tokens - Array of tokens to be updated.
   * @param {object} assetImages - Token images, by token address.
   */
  _updateAccountTokens(tokens, assetImages) {
    const { chainId, selectedAddress } = this.getTokenContext();
    const { accountTokens, accountAssetImages } = this.store.getState();
    this.store.updateState({
      accountTokens: {
        ...accountTokens,
        [selectedAddress]: {
          ...accountTokens[selectedAddress],
          [chainId]: tokens,
        },
      },
      accountAssetImages: {
        ...accountAssetImages,
        [selectedAddress]: {
          ...accountAssetImages[selectedAddress],
          [chainId]: assetImages,
        },
      },
      tokens,
      assetImages,
    });
  }

  /** Updates the active projections from their account/chain buckets. */
  _updateTokens() {
    const { tokens, assetImages } = this._getTokenRelatedStates();
    this.store.updateState({ tokens, assetImages });
  }

  /**
   * Gets token state for an account on the current configured chain.
   *
   * @param {string} [selectedAddress] - The account to read.
   * @returns {{tokens: Array, assetImages: object}} Active token state.
   */
  _getTokenRelatedStates(selectedAddress = this.getSelectedAddress()) {
    const { accountTokens, accountAssetImages } = this.store.getState();
    const chainId = tokenChainId(this.network.providerStore.getState());
    return {
      tokens: accountTokens[selectedAddress]?.[chainId] || [],
      assetImages: accountAssetImages[selectedAddress]?.[chainId] || {},
    };
  }

  /** Invalidates both queued suggestions and asynchronous work already taken. */
  _invalidateTokenContext() {
    this._tokenContextVersion += 1;
    this._watchAssetRequests.rejectAll();
  }

  /**
   * Captures the destination before any asynchronous token work begins.
   *
   * @returns {object} The chain, account, and context generation.
   */
  getTokenContext() {
    const chainId = tokenChainId(this.network.providerStore.getState());
    const selectedAddress = this.getSelectedAddress();
    if (!chainId || !this.store.getState().identities[selectedAddress]) {
      throw providerErrors.userRejectedRequest(
        'A token requires an active account and a known chain.',
      );
    }
    return { chainId, selectedAddress, version: this._tokenContextVersion };
  }

  /**
   * Refuses a token operation if its original approval context has changed.
   *
   * @param {object} context - The captured token context.
   */
  _assertTokenContext(context) {
    const current = this.getTokenContext();
    if (
      context.version !== current.version ||
      context.chainId !== current.chainId ||
      context.selectedAddress !== current.selectedAddress
    ) {
      throw providerErrors.userRejectedRequest(
        'The network or account changed. Request the token again.',
      );
    }
  }

  /**
   * Handle the suggestion of an ERC20 asset through `watchAsset`. Like
   * upstream's approval, each request waits for the user's answer, records
   * the site that made it, and a site may have one pending at a time.
   *
   * @param {object} options - The asset options: address, symbol, decimals
   * and image.
   * @param {string} origin - The site that suggested the token.
   * @returns {Promise<boolean>} Resolves with true once the user adds the
   * token; rejects with a user-rejected error if they decline.
   */
  async _handleWatchAssetERC20(options, origin) {
    const context = this.getTokenContext();
    const provider = this.network.providerStore.getState();
    const { address, symbol, decimals, image } = options ?? {};
    let tokenOpts;
    try {
      tokenOpts = await this._resolveERC20AssetParams({
        rawAddress: address,
        symbol,
        decimals,
        image,
      });
    } catch (error) {
      throw rpcErrors.invalidParams(error.message);
    }
    this._assertTokenContext(context);
    this._watchAssetRequests.assertNoPendingRequest(origin);
    // The prompt shows only an image the site sent as a data URL small
    // enough to be saved; a remote one is downloaded if, and only once, the
    // user adds the token. Any other image is dropped now.
    const isDataUrl = isImageDataUrl(tokenOpts.image);
    const dataUrl =
      isDataUrl && tokenOpts.image.length <= MAX_IMAGE_DATA_URL_LENGTH
        ? tokenOpts.image
        : undefined;
    const id = nanoid();
    const suggestion = {
      id,
      origin,
      chainId: context.chainId,
      selectedAddress: context.selectedAddress,
      networkName:
        BUILT_IN_NETWORKS[provider.type]?.name ||
        provider.nickname ||
        context.chainId,
      address: normalizeAddress(tokenOpts.rawAddress),
      symbol: tokenOpts.symbol,
      decimals: tokenOpts.decimals,
      image: dataUrl,
      time: Date.now(),
    };
    const result = this._watchAssetRequests.add(suggestion, {
      context,
      image: isDataUrl ? dataUrl : tokenOpts.image,
    });
    this.showWatchAssetRequest?.();
    return result;
  }

  /**
   * Turns a site's token image into a data URL, downloading it once if it is
   * remote, so that showing the token never contacts the image's host.
   *
   * @param {string} [image] - A data URL or http(s) URL.
   * @returns {Promise<string|undefined>} The data URL, or undefined.
   */
  async _cacheImage(image) {
    if (isImageDataUrl(image)) {
      return image.length <= MAX_IMAGE_DATA_URL_LENGTH ? image : undefined;
    }
    if (typeof image !== 'string' || !/^https?:\/\//iu.test(image)) {
      return undefined;
    }
    return this.fetchImage(image);
  }

  /**
   * Validates that the passed options for suggested token have all required properties.
   *
   * @param {object} opts - The options object to validate
   * @throws {Error} Throw a custom error indicating that address, symbol and/or decimals
   * doesn't fulfill requirements
   */
  _validateERC20AssetParams(opts) {
    const { rawAddress, symbol, decimals, image } = opts;
    if (!rawAddress || !symbol || typeof decimals === 'undefined') {
      throw new Error(
        `Cannot suggest token without address, symbol, and decimals`,
      );
    }
    if (typeof symbol !== 'string') {
      throw new Error(`Invalid symbol: not a string`);
    }
    if (!(symbol.length < 7)) {
      throw new Error(`Invalid symbol ${symbol} more than six characters`);
    }
    // The symbol comes from the site or its contract and is shown as the
    // token's name: a direction override can make CDSU read as USDC.
    if (UNSAFE_TEXT.test(symbol)) {
      throw new Error(
        'Invalid symbol: contains control or formatting characters',
      );
    }
    const numDecimals = parseInt(decimals, 10);
    if (!Number.isInteger(numDecimals) || numDecimals > 36 || numDecimals < 0) {
      throw new Error(
        `Invalid decimals ${decimals} must be at least 0, and not over 36`,
      );
    }
    if (!isValidAddress(rawAddress)) {
      throw new Error(`Invalid address ${rawAddress}`);
    }
    if (image !== undefined && image !== null && typeof image !== 'string') {
      throw new Error(`Invalid image: not a string`);
    }
  }

  /**
   * Checks a suggested ERC20 token against its contract, as upstream's
   * TokensController.watchAsset does. The contract's symbol and decimals win
   * over the request's, and a request that disagrees with them is refused.
   * A value the contract does not return falls back to the request's.
   *
   * @param {object} opts - The suggested token
   * @param {string} opts.rawAddress - The token contract address
   * @param {string} [opts.symbol] - The requested symbol
   * @param {number|string} [opts.decimals] - The requested decimals
   * @param {string} [opts.image] - The requested image URL
   * @returns {Promise<object>} The validated token, with numeric decimals
   * @throws {Error} If the token is invalid or disagrees with its contract
   */
  async _resolveERC20AssetParams({ rawAddress, symbol, decimals, image }) {
    if (!rawAddress || !isValidAddress(rawAddress)) {
      throw new Error(`Invalid address ${rawAddress}`);
    }
    const [contractSymbol, contractDecimals] = await Promise.all([
      this._readTokenContract(rawAddress, 'symbol()', 'string'),
      this._readTokenContract(rawAddress, 'decimals()', 'uint256'),
    ]);
    if (
      contractSymbol !== undefined &&
      symbol !== undefined &&
      (typeof symbol !== 'string' ||
        symbol.toUpperCase() !== contractSymbol.toUpperCase())
    ) {
      throw new Error(
        `The symbol in the request (${symbol}) does not match the symbol in the contract (${contractSymbol})`,
      );
    }
    const contractDecimalsStr =
      contractDecimals === undefined ? undefined : String(contractDecimals);
    if (
      contractDecimalsStr !== undefined &&
      decimals !== undefined &&
      String(decimals) !== contractDecimalsStr
    ) {
      throw new Error(
        `The decimals in the request (${decimals}) do not match the decimals in the contract (${contractDecimalsStr})`,
      );
    }
    const tokenOpts = {
      rawAddress,
      symbol: contractSymbol ?? symbol,
      decimals: contractDecimalsStr ?? decimals,
      image,
    };
    this._validateERC20AssetParams(tokenOpts);
    return { ...tokenOpts, decimals: parseInt(tokenOpts.decimals, 10) };
  }

  /**
   * Reads one value from a token contract on the current network.
   *
   * @param {string} address - The token contract address
   * @param {string} signature - The function, such as 'symbol()'
   * @param {string} outputType - The type it returns
   * @returns {Promise<*>} The value, or undefined if it could not be read
   */
  async _readTokenContract(address, signature, outputType) {
    const provider = this.getProvider?.();
    if (!provider) {
      return undefined;
    }
    try {
      const [value] = await callContract(
        pify(new EthQuery(provider)),
        address,
        signature,
        [outputType],
      );
      return value;
    } catch (_) {
      return undefined;
    }
  }
}
