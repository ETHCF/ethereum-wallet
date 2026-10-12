import browserGlobal from './browser-global';

const DB_NAME = 'nft-images';
const STORE_NAME = 'images';

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Downloaded NFT images, as data URLs, kept in IndexedDB rather than with the
 * rest of the wallet's state: the state is written out whole on every change,
 * and NFT images are too large to rewrite each time.
 *
 * A key with a null value is an image that could not be downloaded, so that
 * it is not tried again.
 */
export default class NftImageStore {
  /**
   * Opens no database until the first image is read or stored.
   *
   * @param {object} [indexedDB] - The IndexedDB factory.
   */
  constructor(indexedDB = browserGlobal.indexedDB) {
    this._indexedDB = indexedDB;
  }

  _open() {
    if (!this._db) {
      const request = this._indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      this._db = promisify(request);
    }
    return this._db;
  }

  async _store(mode) {
    const db = await this._open();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  /**
   * Whether an image, or a failed download, is stored under a key.
   *
   * @param {string} key - The image's key.
   * @returns {Promise<boolean>} Whether the key is stored.
   */
  async has(key) {
    const store = await this._store('readonly');
    return (await promisify(store.count(key))) > 0;
  }

  /**
   * Returns the stored images for the given keys.
   *
   * @param {string[]} keys - The images' keys.
   * @returns {Promise<object>} The data URL, or null, of each stored key.
   */
  async get(keys) {
    const store = await this._store('readonly');
    const entries = await Promise.all(
      keys.map(async (key) => [key, await promisify(store.get(key))]),
    );
    return Object.fromEntries(
      entries.filter(([, value]) => value !== undefined),
    );
  }

  /**
   * Stores an image, or null for one that could not be downloaded.
   *
   * @param {string} key - The image's key.
   * @param {string|null} value - The data URL, or null.
   */
  async set(key, value) {
    const store = await this._store('readwrite');
    await promisify(store.put(value, key));
  }

  /**
   * Removes every stored image.
   */
  async clear() {
    const store = await this._store('readwrite');
    await promisify(store.clear());
  }
}
