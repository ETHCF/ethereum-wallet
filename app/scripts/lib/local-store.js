import log from 'loglevel';

import extension from './extension-api';

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
   * Returns all of the keys currently saved
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
   * Returns all of the keys currently saved
   *
   * @private
   * @returns {object} the key-value map from local storage
   */
  _get() {
    return extension.storage.local.get(null);
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
