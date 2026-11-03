import DEFAULT_CONFIG from 'eth-phishing-detect/src/config.json';
import PhishingDetector from 'eth-phishing-detect/src/detector';
import log from 'loglevel';

import extension from '../lib/extension-api';

const CONFIG_URL =
  'https://cdn.jsdelivr.net/gh/MetaMask/eth-phishing-detect@main/src/config.json';
// How long a downloaded list is used before checking for a newer one.
const DEFAULT_INTERVAL = 60 * 60 * 1000;
// How long to wait before trying again after a download fails.
const DEFAULT_RETRY_DELAY = 5 * 60 * 1000;

// The list is saved apart from its metadata, so that checking for a newer
// list rewrites only the small metadata record unless the list has changed.
export const LIST_KEY = 'phishingList';
export const META_KEY = 'phishingListMeta';

const isList = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Whether a downloaded or saved list can be used. The detector accepts any
 * object, so an empty or malformed list would silently disable blocking.
 *
 * @param {object} config - The eth-phishing-detect configuration.
 * @returns {boolean} Whether it is a usable list.
 */
function isValidConfig(config) {
  return Boolean(
    config &&
    isList(config.blacklist) &&
    config.blacklist.length &&
    isList(config.whitelist) &&
    isList(config.fuzzylist),
  );
}

/**
 * Checks hostnames against the eth-phishing-detect lists. Replaces
 * PhishingController from the legacy @metamask/controllers package.
 *
 * The background can be stopped and restarted many times an hour, so the
 * downloaded list and the time of the next check are saved. A restart reuses
 * the saved list, and a newer one is only asked for once the interval has
 * passed, when a hostname is checked.
 */
export default class PhishingController {
  /**
   * Creates a PhishingController and loads the saved list.
   *
   * @param {object} [opts] - Controller options.
   * @param {number} [opts.interval] - How long a list is used before checking for a newer one, in milliseconds
   * @param {number} [opts.retryDelay] - How long to wait after a failed download, in milliseconds
   * @param {Function} [opts.fetch] - The fetch implementation
   * @param {object} [opts.storage] - The storage area the list is saved in; without one, nothing is saved
   * @param {Function} [opts.now] - Returns the current time in milliseconds
   * @param {Function} [opts.canUpdate] - Returns whether a newer list may be downloaded
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    retryDelay = DEFAULT_RETRY_DELAY,
    fetch = globalThis.fetch.bind(globalThis),
    storage = extension.storage?.local,
    now = Date.now,
    canUpdate = () => true,
  } = {}) {
    this.interval = interval;
    this.retryDelay = retryDelay;
    this._fetch = fetch;
    this._storage = storage;
    this._now = now;
    this._canUpdate = canUpdate;
    this._etag = '';
    this._nextCheck = 0;
    this._updating = null;
    this._loaded = false;
    this._detector = new PhishingDetector(DEFAULT_CONFIG);
    // Hostnames the user chose to visit despite the warning, for this session.
    this._safelist = new Set();
    this.ready = this._load().then(() => {
      this._loaded = true;
      return this.maybeUpdate();
    });
  }

  /**
   * Checks whether a hostname should be blocked, and starts checking for a
   * newer list in the background if the current one is due for a refresh.
   *
   * @param {string} hostname - The hostname to check
   * @returns {boolean} Whether the hostname is on the blocklist and not safelisted
   */
  test(hostname) {
    this.maybeUpdate();
    if (this._safelist.has(hostname)) {
      return false;
    }
    return this._detector.check(hostname).result;
  }

  /**
   * Stops warning about a hostname for the rest of this session.
   *
   * @param {string} hostname - The hostname to stop warning about
   */
  bypass(hostname) {
    this._safelist.add(hostname);
  }

  /**
   * Checks for a newer list if one is due and updates are allowed, at most
   * one check at a time.
   *
   * @returns {Promise<void>} Settles when the check, if any, has finished.
   */
  maybeUpdate() {
    // Until the saved list and schedule are loaded, a check would always look
    // due, and would download a list that may already be saved.
    if (!this._loaded) {
      return this.ready;
    }
    if (
      !this._updating &&
      this._now() >= this._nextCheck &&
      this._canUpdate()
    ) {
      this._updating = this.updatePhishingList()
        .catch((error) => {
          log.warn('ecf-wallet - phishing list update failed', error);
        })
        .finally(() => {
          this._updating = null;
        });
    }
    return this._updating ?? Promise.resolve();
  }

  /**
   * Downloads the list if it has changed, and saves it. A failed download
   * is tried again after the retry delay.
   *
   * @returns {Promise<void>}
   */
  async updatePhishingList() {
    // Count the attempt before it finishes, so a restart during a slow or
    // failing download does not start another one straight away.
    this._nextCheck = this._now() + this.retryDelay;
    let response;
    try {
      response = await this._fetch(CONFIG_URL, {
        headers: { 'If-None-Match': this._etag },
      });
      if (response.status === 304) {
        this._nextCheck = this._now() + this.interval;
        await this._save();
        return;
      }
      if (!response.ok) {
        throw new Error(
          `Fetch failed with status '${response.status}' for request '${CONFIG_URL}'`,
        );
      }
      const config = await response.json();
      if (!isValidConfig(config)) {
        throw new Error('Invalid phishing list');
      }
      this._detector = new PhishingDetector(config);
      // Save the ETag only after the list is accepted, so a rejected list is retried.
      this._etag = response.headers.get('ETag') || '';
      this._nextCheck = this._now() + this.interval;
      await this._save(config);
    } catch (error) {
      await this._save();
      throw error;
    }
  }

  /**
   * Restores the saved list and the time of the next check.
   *
   * @returns {Promise<void>}
   */
  async _load() {
    if (!this._storage) {
      return;
    }
    try {
      const { [LIST_KEY]: config, [META_KEY]: meta } = await this._storage.get([
        LIST_KEY,
        META_KEY,
      ]);
      if (isValidConfig(config)) {
        this._detector = new PhishingDetector(config);
        // The ETag and the schedule describe the saved list, so they are only
        // used along with it.
        this._etag = typeof meta?.etag === 'string' ? meta.etag : '';
        this._nextCheck = Number.isFinite(meta?.nextCheck) ? meta.nextCheck : 0;
      } else if (config === undefined && Number.isFinite(meta?.nextCheck)) {
        // No list was saved, as after failed downloads: keep waiting out the
        // retry delay, then download the whole list. A damaged saved list is
        // replaced straight away instead.
        this._nextCheck = meta.nextCheck;
      }
    } catch (error) {
      log.warn('ecf-wallet - could not load the saved phishing list', error);
    }
  }

  /**
   * Saves the time of the next check, and the list if a new one was downloaded.
   *
   * @param {object} [config] - A newly downloaded list.
   * @returns {Promise<void>}
   */
  async _save(config) {
    if (!this._storage) {
      return;
    }
    const values = {
      [META_KEY]: { etag: this._etag, nextCheck: this._nextCheck },
    };
    if (config) {
      values[LIST_KEY] = config;
    }
    try {
      await this._storage.set(values);
    } catch (error) {
      log.warn('ecf-wallet - could not save the phishing list', error);
    }
  }
}
