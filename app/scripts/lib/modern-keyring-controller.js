import { ObservableStore } from '@metamask/obs-store';
import { validateMnemonic } from '@metamask/scure-bip39';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import { EventEmitter } from 'events';
import log from 'loglevel';

import SessionEncryptor from './session-encryptor';
import { signTypedData } from './signing-utils';
import {
  HD_KEY_TREE,
  SIMPLE_KEY_PAIR,
  createSoftwareKeyring,
  getSoftwareKeyringTypes,
  serializeKeyring,
} from './software-keyrings';
import { normalizeAddress } from './util';

function memoryStorage() {
  const values = {};
  return {
    get: async (key) => ({ [key]: values[key] }),
    set: async (data) => Object.assign(values, data),
    remove: async (key) => {
      delete values[key];
    },
    setAccessLevel: async () => undefined,
  };
}

// Manages the encrypted vault and the keyrings in it. It keeps the vault
// format and account derivation of eth-keyring-controller, which it replaces,
// and guards asynchronous writes and unlocks against wallet lifecycle changes.
export default class ModernKeyringController extends EventEmitter {
  /**
   * Creates a locked controller holding the persisted vault.
   *
   * @param {object} opts - The controller options.
   * @param {Function[]} [opts.keyringTypes] - Additional (hardware) keyring classes
   * @param {object} [opts.initState] - The persisted state, holding the vault
   * @param {object} [opts.encryptor] - Encrypts the vault; the wallet passes its
   * SessionEncryptor. Defaults to one without a persisted session.
   */
  constructor({ keyringTypes = [], initState = {}, encryptor } = {}) {
    super();
    this.additionalKeyringTypes = keyringTypes;
    this.store = new ObservableStore(initState);
    this.memStore = new ObservableStore({
      isUnlocked: false,
      keyringTypes: [
        SIMPLE_KEY_PAIR,
        HD_KEY_TREE,
        ...keyringTypes.map((Keyring) => Keyring.type),
      ],
      keyrings: [],
    });
    this.encryptor = encryptor || new SessionEncryptor(memoryStorage());
    this.keyrings = [];
    this.vaultGeneration = 0;
    this.vaultWrites = Promise.resolve();
    this.keyringDisplayRequest = 0;
  }

  get keyringTypes() {
    return [...getSoftwareKeyringTypes(), ...this.additionalKeyringTypes];
  }

  assertVaultGeneration(generation) {
    if (generation !== this.vaultGeneration) {
      throw new Error(
        'Wallet operation cancelled because the wallet was locked or replaced.',
      );
    }
  }

  fullUpdate() {
    this.emit('update', this.memStore.getState());
    return this.memStore.getState();
  }

  setUnlocked() {
    this.memStore.updateState({ isUnlocked: true });
    this.emit('unlock');
  }

  async setLocked() {
    this.vaultGeneration += 1;
    this.password = null;
    const { keyrings } = this;
    this.keyrings = [];
    this.memStore.updateState({ isUnlocked: false, keyrings: [] });
    // Notify synchronously so session keys and hardware requests are invalidated
    // before any pending promise can restore them.
    this.emit('lock');
    keyrings.forEach((keyring) => keyring.destroy?.());
    return this.fullUpdate();
  }

  async verifyPassword(password) {
    const { vault } = this.store.getState();
    if (!vault) {
      throw new Error('Cannot unlock without a previous vault.');
    }
    await this.encryptor.decrypt(password, vault);
  }

  getKeyringClassForType(type) {
    return this.keyringTypes.find((Keyring) => Keyring.type === type);
  }

  getKeyringsByType(type) {
    return this.keyrings.filter((keyring) => keyring.type === type);
  }

  /**
   * Creates a keyring from its serialized form, or an empty one. Unknown types
   * fail loudly rather than dropping keys from the vault.
   *
   * @param {string} type - The keyring type
   * @param {*} [data] - The serialized keyring
   * @returns {Promise<object>} The keyring
   */
  async createKeyring(type, data) {
    const Keyring = this.getKeyringClassForType(type);
    if (!Keyring) {
      throw new Error(`Unsupported keyring type: ${type}`);
    }
    if (getSoftwareKeyringTypes().includes(Keyring)) {
      return createSoftwareKeyring(Keyring, data);
    }
    // Hardware keyrings deserialize in their constructor.
    return new Keyring(data);
  }

  persistAllKeyrings(password = this.password) {
    const generation = this.vaultGeneration;
    const operation = this.vaultWrites.then(async () => {
      this.assertVaultGeneration(generation);
      if (typeof password !== 'string') {
        throw new Error('KeyringController - password is not a string');
      }
      const serialized = await Promise.all(
        this.keyrings.map(async (keyring) => ({
          type: keyring.type,
          data: await serializeKeyring(keyring),
        })),
      );
      this.assertVaultGeneration(generation);
      const vault = await this.encryptor.encrypt(password, serialized);
      this.assertVaultGeneration(generation);
      this.password = password;
      this.store.updateState({ vault });
      return true;
    });
    this.vaultWrites = operation.catch(() => undefined);
    return operation;
  }

  async submitPassword(password) {
    this.vaultGeneration += 1;
    const generation = this.vaultGeneration;
    await this.unlockKeyrings(password);
    this.assertVaultGeneration(generation);
    this.setUnlocked();
    // Runs after unlocking so the slower key derivation does not delay it.
    this.upgradeVaultEncryption(password);
    return this.fullUpdate();
  }

  /**
   * Re-encrypts a vault that uses an outdated key derivation. Only a real
   * password unlock can do this; restored sessions hold just the old key.
   * Like any save, it is serialized with other vault writes and cancelled by Lock.
   *
   * @param {string} password - The password used to unlock.
   */
  async upgradeVaultEncryption(password) {
    const { vault } = this.store.getState();
    if (
      !this.encryptor.isVaultUpdated ||
      password === this.encryptor.sessionPassword ||
      this.encryptor.isVaultUpdated(vault)
    ) {
      return;
    }
    try {
      await this.persistAllKeyrings(password);
    } catch (error) {
      // The existing vault remains valid, so the upgrade is retried on the next unlock.
      log.error('Failed to upgrade vault encryption', error);
    }
  }

  async unlockKeyrings(password) {
    const generation = this.vaultGeneration;
    await this.vaultWrites;
    this.assertVaultGeneration(generation);
    const { vault } = this.store.getState();
    if (!vault) {
      throw new Error('Cannot unlock without a previous vault.');
    }
    const serialized = await this.encryptor.decrypt(password, vault);
    this.assertVaultGeneration(generation);
    const keyrings = await Promise.all(
      serialized.map(async ({ type, data }) => {
        const keyring = await this.createKeyring(type, data);
        await keyring.getAccounts();
        return keyring;
      }),
    );
    this.assertVaultGeneration(generation);
    this.password = password;
    this.keyrings = keyrings;
    await this._updateMemStoreKeyrings();
    this.assertVaultGeneration(generation);
    return keyrings;
  }

  async addNewKeyring(type, opts) {
    const generation = this.vaultGeneration;
    const keyring = await this.createKeyring(type, opts);
    const accounts = await keyring.getAccounts();
    await this.checkForDuplicate(type, accounts);
    this.assertVaultGeneration(generation);
    this.keyrings.push(keyring);
    await this.persistAllKeyrings();
    this.assertVaultGeneration(generation);
    await this._updateMemStoreKeyrings();
    this.assertVaultGeneration(generation);
    this.fullUpdate();
    return keyring;
  }

  async checkForDuplicate(type, newAccounts) {
    if (type !== SIMPLE_KEY_PAIR) {
      return newAccounts;
    }
    const accounts = await this.getAccounts();
    if (accounts.includes(normalizeAddress(newAccounts[0]))) {
      throw new Error("The account you're are trying to import is a duplicate");
    }
    return newAccounts;
  }

  displayForKeyring(keyring) {
    return keyring.getAccounts().then((accounts) => ({
      type: keyring.type,
      accounts: accounts.map(normalizeAddress),
    }));
  }

  async _updateMemStoreKeyrings() {
    const generation = this.vaultGeneration;
    const current = this.keyrings;
    this.keyringDisplayRequest += 1;
    const request = this.keyringDisplayRequest;
    const keyrings = await Promise.all(
      current.map((keyring) => this.displayForKeyring(keyring)),
    );
    if (
      generation === this.vaultGeneration &&
      current === this.keyrings &&
      request === this.keyringDisplayRequest
    ) {
      this.memStore.updateState({ keyrings });
    }
    return this.memStore.getState();
  }

  async getAccounts() {
    const accounts = await Promise.all(
      (this.keyrings || []).map((keyring) => keyring.getAccounts()),
    );
    return accounts.flat().map(normalizeAddress);
  }

  async getKeyringForAccount(address) {
    const hexed = normalizeAddress(address);
    const candidates = await Promise.all(
      this.keyrings.map(async (keyring) => [
        keyring,
        await keyring.getAccounts(),
      ]),
    );
    const winner = candidates.find(([, accounts]) =>
      accounts.map(normalizeAddress).includes(hexed),
    );
    if (winner) {
      return winner[0];
    }
    let errorInfo = 'Error info: ';
    if (!address) {
      errorInfo += 'The address passed in is invalid/empty; ';
    }
    errorInfo += candidates.length
      ? 'There are keyrings, but none match the address;'
      : 'There are no keyrings; ';
    throw new Error(`No keyring found for the requested account. ${errorInfo}`);
  }

  async addNewAccount(keyring) {
    const generation = this.vaultGeneration;
    const accounts = await keyring.addAccounts(1);
    this.assertVaultGeneration(generation);
    accounts.forEach((account) => this.emit('newAccount', account));
    await this.persistAllKeyrings();
    this.assertVaultGeneration(generation);
    await this._updateMemStoreKeyrings();
    this.assertVaultGeneration(generation);
    return this.fullUpdate();
  }

  async exportAccount(address) {
    const keyring = await this.getKeyringForAccount(address);
    return keyring.exportAccount(normalizeAddress(address));
  }

  async removeAccount(address) {
    const generation = this.vaultGeneration;
    const keyring = await this.getKeyringForAccount(address);
    this.assertVaultGeneration(generation);
    if (typeof keyring.removeAccount !== 'function') {
      throw new Error(
        `Keyring ${keyring.type} doesn't support account removal operations`,
      );
    }
    await keyring.removeAccount(normalizeAddress(address));
    this.assertVaultGeneration(generation);
    this.emit('removedAccount', address);
    await this.removeEmptyKeyrings();
    this.assertVaultGeneration(generation);
    await this.persistAllKeyrings();
    this.assertVaultGeneration(generation);
    await this._updateMemStoreKeyrings();
    this.assertVaultGeneration(generation);
    return this.fullUpdate();
  }

  async removeEmptyKeyrings() {
    const generation = this.vaultGeneration;
    const empty = new Set();
    await Promise.all(
      this.keyrings.map(async (keyring) => {
        if ((await keyring.getAccounts()).length === 0) {
          empty.add(keyring);
        }
      }),
    );
    this.assertVaultGeneration(generation);
    // Retain keyrings imported while the account checks were pending.
    this.keyrings = this.keyrings.filter((keyring) => !empty.has(keyring));
  }

  async createNewVaultAndKeychain(password) {
    return this.createVault(password, undefined, true);
  }

  async createNewVaultAndRestore(password, mnemonic) {
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Seed phrase is invalid.');
    }
    return this.createVault(password, mnemonic);
  }

  /**
   * Replaces the vault with a new one holding a single HD keyring, and unlocks it.
   *
   * @param {string} password - The vault password
   * @param {string} [mnemonic] - The seed phrase; a random one if omitted
   * @param {boolean} [notify] - Whether to emit newVault
   * @returns {Promise<object>} The keyring controller's memory state.
   */
  async createVault(password, mnemonic, notify = false) {
    if (typeof password !== 'string') {
      throw new Error('Password must be text.');
    }
    this.vaultGeneration += 1;
    const generation = this.vaultGeneration;
    await this.encryptor.clear?.();
    await this.vaultWrites;
    this.assertVaultGeneration(generation);
    const keyring = await this.createKeyring(
      HD_KEY_TREE,
      mnemonic === undefined ? undefined : { mnemonic, numberOfAccounts: 1 },
    );
    if (mnemonic === undefined) {
      await keyring.generateRandomMnemonic();
      await keyring.addAccounts(1);
    }
    const [address] = await keyring.getAccounts();
    this.assertVaultGeneration(generation);
    if (!address) {
      throw new Error('KeyringController - No account found on keychain.');
    }
    this.keyrings = [keyring];
    await this.persistAllKeyrings(password);
    this.assertVaultGeneration(generation);
    await this._updateMemStoreKeyrings();
    this.assertVaultGeneration(generation);
    if (notify) {
      this.emit('newVault', address);
    }
    this.setUnlocked();
    return this.fullUpdate();
  }

  async signTransaction(ethTx, fromAddress, opts = {}) {
    const address = normalizeAddress(fromAddress);
    const keyring = await this.getKeyringForAccount(address);
    return keyring.signTransaction(address, ethTx, opts);
  }

  async signMessage(msgParams, opts = {}) {
    const address = normalizeAddress(msgParams.from);
    const keyring = await this.getKeyringForAccount(address);
    return keyring.signMessage(address, msgParams.data, opts);
  }

  async signPersonalMessage(msgParams, opts = {}) {
    const address = normalizeAddress(msgParams.from);
    const keyring = await this.getKeyringForAccount(address);
    return keyring.signPersonalMessage(address, msgParams.data, opts);
  }

  async getEncryptionPublicKey(fromAddress, opts = {}) {
    const address = normalizeAddress(fromAddress);
    const keyring = await this.getKeyringForAccount(address);
    return keyring.getEncryptionPublicKey(address, opts);
  }

  async decryptMessage(msgParams, opts = {}) {
    const address = normalizeAddress(msgParams.from);
    const keyring = await this.getKeyringForAccount(address);
    return keyring.decryptMessage(address, msgParams.data, opts);
  }

  async signTypedMessage(params, opts = { version: 'V1' }) {
    const address = normalizeAddress(params.from);
    const keyring = await this.getKeyringForAccount(address);
    if ([HD_KEY_TREE, SIMPLE_KEY_PAIR].includes(keyring.type)) {
      // The wallet's own typed-data signing validates the payload first.
      return signTypedData({
        privateKey: Buffer.from(await keyring.exportAccount(address), 'hex'),
        data: params.data,
        version: opts.version,
      });
    }
    return keyring.signTypedData(address, params.data, opts);
  }
}
