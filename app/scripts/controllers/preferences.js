import { isValidAddress } from '@ethereumjs/util';
import EthQuery from '@metamask/eth-query';
import { ObservableStore } from '@metamask/obs-store';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { nanoid } from 'nanoid';
import pify from 'pify';

import { normalizeChainId } from './network/chain-utils';
import { addInternalMethodPrefix } from './permissions';
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
 * Splits saved token images into data URLs, which the wallet shows, and
 * remote URLs saved by earlier versions, which it must download first.
 *
 * @param {object} assetImages - Token images, by token address.
 * @returns {{ kept: object, remote: Array<[string, string]> }} The data URL
 * images, and the address and URL of each remote one.
 */
function splitAssetImages(assetImages = {}) {
  const kept = {};
  const remote = [];
  for (const [address, image] of Object.entries(assetImages)) {
    if (isImageDataUrl(image)) {
      kept[address] = image;
    } else if (typeof image === 'string' && image) {
      remote.push([address, image]);
    }
  }
  return { kept, remote };
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
   * @property {object} store.accountTokens The tokens stored per account and then per network type
   * @property {object} store.assetImages Contains assets objects related to assets added
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
      assetImages: {},
      tokens: [],
      usePhishDetect: true,
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
    // The wallet shows token images only from data URLs, so that showing
    // them asks no host for anything.
    const { kept, remote } = splitAssetImages(initState.assetImages);
    initState.assetImages = kept;

    this.network = opts.network;
    this.getProvider = opts.getProvider;
    this.fetchImage = opts.fetchImage ?? fetchImageAsDataUrl;
    this.store = new ObservableStore(initState);
    this.store.setMaxListeners(12);
    // A suggestion belongs to a live wallet_watchAsset request, so, like
    // upstream's approvals, it is kept in memory only, keyed by request id.
    this.watchAssetStore = new ObservableStore({ suggestedTokens: {} });
    this._watchAssetRequests = new Map();
    this.showWatchAssetRequest = opts.showWatchAssetRequest;
    this._subscribeProviderType();

    global.setPreference = (key, value) => {
      return this.setFeatureFlag(key, value);
    };

    this.cachingAssetImages = this._cacheRemoteAssetImages(remote);
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
    this.store.updateState({ identities, accountTokens });
  }

  /**
   * Removes an address from state
   *
   * @param {string} address - A hex address
   * @returns {string} the address that was removed
   */
  removeAddress(address) {
    const { identities } = this.store.getState();
    const { accountTokens } = this.store.getState();
    if (!identities[address]) {
      throw new Error(`${address} can't be deleted cause it was not found`);
    }
    delete identities[address];
    delete accountTokens[address];
    this.store.updateState({ identities, accountTokens });

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
    const { identities, accountTokens } = this.store.getState();
    addresses.forEach((address) => {
      // skip if already exists
      if (identities[address]) {
        return;
      }
      // add missing identity
      const identityCount = Object.keys(identities).length;

      accountTokens[address] = {};
      identities[address] = { name: `Account ${identityCount + 1}`, address };
    });
    this.store.updateState({ identities, accountTokens });
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
   */
  async acceptWatchAsset(id) {
    const { suggestion, image, resolve, reject } =
      this._takeWatchAssetRequest(id);
    try {
      const cachedImage = await this._cacheImage(image);
      await this.addToken(
        suggestion.address,
        suggestion.symbol,
        suggestion.decimals,
        cachedImage,
      );
      resolve(true);
    } catch (error) {
      // The request is already taken, so the site must be answered here.
      reject(error);
      throw error;
    }
  }

  /**
   * Refuses a suggested token, answering the site's wallet_watchAsset request
   * with a user-rejected error, as upstream does.
   *
   * @param {string} id - The suggestion's request id.
   */
  rejectWatchAsset(id) {
    this._takeWatchAssetRequest(id).reject(
      providerErrors.userRejectedRequest(),
    );
  }

  /**
   * Refuses every pending suggested token, as upstream does with its
   * approvals when the user closes the notification window.
   */
  rejectPendingWatchAssets() {
    for (const id of [...this._watchAssetRequests.keys()]) {
      this.rejectWatchAsset(id);
    }
  }

  _takeWatchAssetRequest(id) {
    const request = this._watchAssetRequests.get(id);
    if (!request) {
      throw new Error(`Token suggestion "${id}" not found.`);
    }
    this._watchAssetRequests.delete(id);
    const suggestedTokens = { ...this.getSuggestedTokens() };
    delete suggestedTokens[id];
    this.watchAssetStore.updateState({ suggestedTokens });
    return request;
  }

  /**
   * Setter for the `selectedAddress` property
   *
   * @param {string} _address - A new hex address for an account
   * @returns {Promise<Array>} Promise resolves with tokens
   */
  setSelectedAddress(_address) {
    const address = normalizeAddress(_address);
    this._updateTokens(address);

    const { identities, tokens } = this.store.getState();
    const selectedIdentity = identities[address];
    if (!selectedIdentity) {
      throw new Error(`Identity for '${address} not found`);
    }

    selectedIdentity.lastSelected = Date.now();
    this.store.updateState({ identities, selectedAddress: address });
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
   * @returns {Promise<Array>} Promises the new array of AddedToken objects.
   */
  async addToken(rawAddress, symbol, decimals, image) {
    const address = normalizeAddress(rawAddress);
    const newEntry = { address, symbol, decimals };
    const { tokens } = this.store.getState();
    const assetImages = this.getAssetImages();
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
    const assetImages = this.getAssetImages();
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
      const { tokens } = this._getTokenRelatedStates();
      this.store.updateState({ tokens });
    });
  }

  /**
   * Updates `accountTokens` and `tokens` of current account and network according to it.
   *
   * @param {Array} tokens - Array of tokens to be updated.
   * @param {object} assetImages - Token images, by token address.
   */
  _updateAccountTokens(tokens, assetImages) {
    const { accountTokens, providerType, selectedAddress } =
      this._getTokenRelatedStates();
    accountTokens[selectedAddress][providerType] = tokens;
    this.store.updateState({ accountTokens, tokens, assetImages });
  }

  /**
   * Updates `tokens` of current account and network.
   *
   * @param {string} selectedAddress - Account address to be updated with.
   */
  _updateTokens(selectedAddress) {
    const { tokens } = this._getTokenRelatedStates(selectedAddress);
    this.store.updateState({ tokens });
  }

  /**
   * A getter for `tokens` and `accountTokens` related states.
   *
   * @param {string} [selectedAddress] - A new hex address for an account
   * @returns {{ tokens: Array, accountTokens: object, providerType: string, selectedAddress: string }} States to interact with tokens in `accountTokens`
   */
  _getTokenRelatedStates(selectedAddress) {
    const { accountTokens } = this.store.getState();
    if (!selectedAddress) {
      // eslint-disable-next-line no-param-reassign
      selectedAddress = this.store.getState().selectedAddress;
    }
    const providerType = this.network.providerStore.getState().type;
    if (!Object.prototype.hasOwnProperty.call(accountTokens, selectedAddress)) {
      accountTokens[selectedAddress] = {};
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        accountTokens[selectedAddress],
        providerType,
      )
    ) {
      accountTokens[selectedAddress][providerType] = [];
    }
    const tokens = accountTokens[selectedAddress][providerType];
    return { tokens, accountTokens, providerType, selectedAddress };
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
    const pending = Object.values(this.getSuggestedTokens());
    if (pending.some((suggestion) => suggestion.origin === origin)) {
      throw rpcErrors.resourceUnavailable(
        `A token suggestion from ${origin} is already pending. Please wait.`,
      );
    }
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
      address: normalizeAddress(tokenOpts.rawAddress),
      symbol: tokenOpts.symbol,
      decimals: tokenOpts.decimals,
      image: dataUrl,
      time: Date.now(),
    };
    const result = new Promise((resolve, reject) => {
      this._watchAssetRequests.set(id, {
        suggestion,
        image: isDataUrl ? dataUrl : tokenOpts.image,
        resolve,
        reject,
      });
    });
    this.watchAssetStore.updateState({
      suggestedTokens: { ...this.getSuggestedTokens(), [id]: suggestion },
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
   * Downloads, once, the remote token images an earlier version saved, and
   * replaces each with its data URL. An image that cannot be downloaded is
   * dropped, and the token shows its generated icon instead.
   *
   * @param {Array<[string, string]>} remote - Token addresses and image URLs.
   */
  async _cacheRemoteAssetImages(remote) {
    for (const [address, url] of remote) {
      const image = await this._cacheImage(url);
      // A token added again meanwhile keeps the image it was added with.
      if (image && !Object.hasOwn(this.getAssetImages(), address)) {
        this.store.updateState({
          assetImages: { ...this.getAssetImages(), [address]: image },
        });
      }
    }
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
