import log from 'loglevel';

import extension from './extension-api';

// The keys that hold the versioned wallet state.
const WALLET_STATE_KEYS = ['data', 'meta'];

/**
 * A wrapper around the extension's storage local API
 */
export default class ExtensionStore {
  /**
   * Checks that the storage local API is available.
   *
   * @class
   */
  constructor() {
    this.isSupported = Boolean(extension.storage?.local);
    if (!this.isSupported) {
      log.error('Storage local API not available.');
    }
  }

  /**
   * Returns the saved wallet state
   *
   * @returns {Promise<object|undefined>} The saved state, or undefined if nothing is saved.
   */
  async get() {
    if (!this.isSupported) {
      return undefined;
    }
    const result = await this._get();
    // extension.storage.local always returns an obj
    // if the object is empty, treat it as undefined
    if (isEmpty(result)) {
      return undefined;
    }
    return result;
  }

  /**
   * Sets the key in local state
   *
   * @param {object} state - The state to set
   * @returns {Promise<void>}
   */
  async set(state) {
    return this._set(state);
  }

  /**
   * Returns the saved wallet state. Other features keep their own keys in the
   * same storage area, such as the phishing list, so only the wallet's keys
   * are read.
   *
   * @private
   * @returns {Promise<object>} the key-value map from local storage
   */
  _get() {
    return extension.storage.local.get(WALLET_STATE_KEYS);
  }

  /**
   * Sets the key in local state
   *
   * @param {object} obj - The key to set
   * @returns {Promise<void>}
   * @private
   */
  _set(obj) {
    return extension.storage.local.set(obj);
  }
}

/**
 * Returns whether or not the given object contains no keys
 *
 * @param {object} obj - The object to check
 * @returns {boolean} Whether the object has no keys.
 */
function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}
