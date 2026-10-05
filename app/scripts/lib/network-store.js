import log from 'loglevel';

import browserGlobal from './browser-global';
import LocalStore from './local-store';

const FIXTURE_SERVER_HOST = 'localhost';
const FIXTURE_SERVER_PORT = 12345;
const FIXTURE_SERVER_URL = `http://${FIXTURE_SERVER_HOST}:${FIXTURE_SERVER_PORT}/state.json`;

/**
 * Seeds test storage from a network fixture, then persists local changes.
 */
export default class ReadOnlyNetworkStore {
  constructor() {
    this.localStore = new LocalStore();
    this._initialized = false;
    this._initializing = this._init();
    this._state = undefined;
  }

  /**
   * Declares this store as compatible with the current browser
   */
  isSupported = true;

  /**
   * Initializes by loading state from the network
   */
  async _init() {
    try {
      // Fixtures seed an isolated browser profile once. Subsequent worker starts
      // must restore changes made by the test, just like production.
      const persisted = await this.localStore.get();
      if (persisted) {
        this._state = persisted;
        return;
      }
      const response = await browserGlobal.fetch(FIXTURE_SERVER_URL);
      if (response.ok) {
        this._state = await response.json();
      }
    } catch (error) {
      log.debug(`Error loading network state: '${error.message}'`);
    } finally {
      this._initialized = true;
    }
  }

  /**
   * Returns state
   *
   * @returns {Promise<object>} The state, once it has been loaded.
   */
  async get() {
    if (!this._initialized) {
      await this._initializing;
    }
    return this._state;
  }

  /**
   * Set state
   *
   * @param {object} state - The state to set
   * @returns {Promise<void>}
   */
  async set(state) {
    if (!this._initialized) {
      await this._initializing;
    }
    this._state = state;
    await this.localStore.set(state);
  }
}
