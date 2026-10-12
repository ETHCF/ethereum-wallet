import { ObservableStore } from '@metamask/obs-store';
import contentHash from 'content-hash';
import log from 'loglevel';

import { BUILT_IN_NETWORKS, NFT_DETECTION_NETWORKS } from './network/enums';
import { createNftControllers } from '../lib/modern-controllers-implementation';
import nftImageKey from '../lib/nft-image-key';
import { fetchImageAsDataUrl, isImageDataUrl } from '../lib/remote-image';

export const NFT_DETECTION_CHAIN_IDS = NFT_DETECTION_NETWORKS.map(
  (type) => BUILT_IN_NETWORKS[type].chainId,
);

// NFT images are larger than token icons; a thumbnail is preferred.
export const NFT_IMAGE_MAX_BYTES = 256 * 1024;
// An image already in the metadata as a data URL, up to the same size.
const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil(NFT_IMAGE_MAX_BYTES / 3) * 4 + 64;

/**
 * Turns an NFT image URL into one the image fetcher can download: an https
 * URL, or an ipfs:// URL rewritten to the user's IPFS gateway.
 *
 * @param {string} [url] - The image URL from the NFT's metadata.
 * @param {string} ipfsGateway - The IPFS gateway host, such as dweb.link.
 * @returns {string|undefined} The URL to download, if any.
 */
export function nftImageUrl(url, ipfsGateway) {
  if (typeof url !== 'string') {
    return undefined;
  }
  const ipfs = /^ipfs:\/\/(?:ipfs\/)?([^/?#]+)(.*)$/u.exec(url);
  if (!ipfs) {
    return /^https:\/\//u.test(url) ? url : undefined;
  }
  try {
    const cid = contentHash.helpers.cidV0ToV1Base32(ipfs[1]);
    return `https://${cid}.ipfs.${ipfsGateway}${ipfs[2]}`;
  } catch (_) {
    return undefined;
  }
}

/**
 * The NFT holdings list. Off by default: detection sends the selected account
 * to the NFT API (nft.api.cx.metamask.io), and showing images contacts the
 * hosts the NFTs' creators chose, so each needs the user's consent, given in
 * the preferences useNftDetection and displayNftMedia.
 *
 * Uses upstream's NftController and NftDetectionController for detection and
 * storage. Images are downloaded once each, through the wallet's image
 * fetcher, and kept in an NftImageStore.
 */
export default class NftsController {
  /**
   * Creates the NFT controllers, in the state the preferences ask for.
   *
   * @param {object} options - The options.
   * @param {object} options.preferencesStore - The preferences store, with
   * useNftDetection, displayNftMedia, ipfsGateway and selectedAddress.
   * @param {Function} options.getChainId - Returns the selected chain ID.
   * @param {Function} options.getProvider - Returns the selected provider.
   * @param {Function} options.isPhishing - Whether a URL's host is on the
   * phishing list.
   * @param {object} options.imageStore - Where downloaded images are kept.
   * @param {object} [options.initState] - The persisted NftController state.
   * @param {Function} [options.fetchImage] - Downloads an image as a data URL.
   */
  constructor({
    preferencesStore,
    getChainId,
    getProvider,
    isPhishing,
    imageStore,
    initState,
    fetchImage = fetchImageAsDataUrl,
  }) {
    this._preferencesStore = preferencesStore;
    this._getChainId = getChainId;
    this._imageStore = imageStore;
    this._fetchImage = fetchImage;

    const { useNftDetection, displayNftMedia } = this._preferences();
    const controllers = createNftControllers({
      state: initState,
      getChainId,
      getProvider,
      getSelectedAddress: () => this._preferences().selectedAddress,
      isPhishing,
      useNftDetection,
    });
    this._nftController = controllers.nftController;
    this._nftDetectionController = controllers.nftDetectionController;
    this._setUseNftDetection = controllers.setUseNftDetection;
    this.store = controllers.store;

    // Tells the UI when images were added, so that it asks for them again.
    this.imagesStore = new ObservableStore({ nftImagesVersion: 0 });

    this._enabled = { useNftDetection, displayNftMedia };
    preferencesStore.subscribe(() => this._onPreferencesChange());
  }

  _preferences() {
    return this._preferencesStore.getState();
  }

  _onPreferencesChange() {
    const { useNftDetection, displayNftMedia } = this._preferences();
    const previous = this._enabled;
    this._enabled = { useNftDetection, displayNftMedia };
    if (useNftDetection !== previous.useNftDetection) {
      this._setUseNftDetection(useNftDetection);
      if (!useNftDetection) {
        // The list came from a third party: turning detection off forgets it.
        this._nftController.resetState();
      }
    }
    const showImages = useNftDetection && displayNftMedia;
    const showedImages = previous.useNftDetection && previous.displayNftMedia;
    if (showedImages && !showImages) {
      this._clearImages().catch(log.error);
    } else if (showImages && !showedImages) {
      this._cacheImages().catch(log.error);
    }
  }

  /**
   * The NFTs of the selected account on the selected network.
   *
   * @returns {object[]} The NFTs.
   */
  _currentNfts() {
    const { selectedAddress } = this._preferences();
    const { allNfts } = this._nftController.state;
    return allNfts[selectedAddress]?.[this._getChainId()] ?? [];
  }

  /**
   * Asks the NFT API for the selected account's NFTs on the selected network,
   * if the user turned detection on and the network is one it is used for,
   * then downloads their images if the user allows that.
   */
  async detectNfts() {
    const { useNftDetection, selectedAddress } = this._preferences();
    const chainId = this._getChainId();
    if (
      !useNftDetection ||
      !selectedAddress ||
      !NFT_DETECTION_CHAIN_IDS.includes(chainId)
    ) {
      return;
    }
    await this._nftDetectionController.detectNfts([chainId], {
      userAddress: selectedAddress,
    });
    await this._cacheImages();
  }

  /**
   * Returns the downloaded images for the given keys.
   *
   * @param {string[]} keys - Keys from nftImageKey.
   * @returns {Promise<object>} The data URL, or null for an image that could
   * not be downloaded, of each key that has been tried.
   */
  async getNftImages(keys) {
    const { useNftDetection, displayNftMedia } = this._preferences();
    if (!useNftDetection || !displayNftMedia || !Array.isArray(keys)) {
      return {};
    }
    return await this._imageStore.get(keys.map(String));
  }

  _imagesAllowed() {
    const { useNftDetection, displayNftMedia } = this._preferences();
    return Boolean(useNftDetection && displayNftMedia);
  }

  async _cacheImages() {
    // One download at a time, each image once.
    this._caching = (this._caching ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this._cacheCurrentImages());
    return this._caching;
  }

  async _cacheCurrentImages() {
    const chainId = this._getChainId();
    for (const nft of this._currentNfts()) {
      if (!this._imagesAllowed()) {
        return;
      }
      const key = nftImageKey(chainId, nft.address, nft.tokenId);
      if (await this._imageStore.has(key)) {
        continue;
      }
      const source = nft.imageThumbnail ?? nft.image ?? nft.imageOriginal;
      const url = nftImageUrl(source, this._preferences().ipfsGateway);
      let image;
      if (isImageDataUrl(source)) {
        // On-chain art: nothing to download.
        image = source.length <= MAX_IMAGE_DATA_URL_LENGTH ? source : undefined;
      } else if (url) {
        image = await this._fetchImage(url, { maxBytes: NFT_IMAGE_MAX_BYTES });
      }
      // The user may have turned images off during the download.
      if (!this._imagesAllowed()) {
        return;
      }
      // A failed download is recorded, so it is not tried again.
      await this._imageStore.set(key, image ?? null);
      this.imagesStore.updateState({
        nftImagesVersion: this.imagesStore.getState().nftImagesVersion + 1,
      });
    }
  }

  async _clearImages() {
    await (this._caching ?? Promise.resolve()).catch(() => undefined);
    await this._imageStore.clear();
    this.imagesStore.updateState({
      nftImagesVersion: this.imagesStore.getState().nftImagesVersion + 1,
    });
  }
}
