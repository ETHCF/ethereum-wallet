import { ObservableStore } from '@metamask/obs-store';
import { validateMnemonic } from '@metamask/scure-bip39';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import { EventEmitter } from 'events';
import log from 'loglevel';

import { INCORRECT_PASSWORD_MESSAGE } from './enums';
import SessionEncryptor from './session-encryptor';
import { assertTypedSignature, signTypedData } from './signing-utils';
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

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Throws unless the password may protect a new or re-encrypted vault. The UI
 * checks the same rule, but the background does not rely on it.
 *
 * @param {string} password - The proposed password.
 */
export function assertNewPassword(password) {
  if (typeof password !== 'string') {
    throw new Error('Password must be text.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
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

  _getVault() {
    const { vault } = this.store.getState();
    if (!vault) {
      throw new Error('Cannot unlock without a previous vault.');
    }
    return vault;
  }

  async verifyPassword(password) {
    // An encryptor without verify caches no key, so decrypting only checks.
    if (this.encryptor.verify) {
      await this.encryptor.verify(password, this._getVault());
    } else {
      await this.encryptor.decrypt(password, this._getVault());
    }
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

  /**
   * Encrypts and stores the keyrings, after any vault write already queued.
   *
   * @param {string} [password] - The password to encrypt with. Without one,
   * the password current when the write runs is used, so a save queued
   * behind a password change cannot restore the old password.
   * @returns {Promise<boolean>} Resolves once the vault is stored.
   */
  persistAllKeyrings(password) {
    return this._queueVaultWrite(async (generation) => {
      const vaultPassword = password === undefined ? this.password : password;
      if (typeof vaultPassword !== 'string') {
        throw new Error('KeyringController - password is not a string');
      }
      const serialized = await this._serializeKeyrings();
      this.assertVaultGeneration(generation);
      const vault = await this.encryptor.encrypt(vaultPassword, serialized);
      this.assertVaultGeneration(generation);
      this.password = vaultPassword;
      this.store.updateState({ vault });
      return true;
    });
  }

  /**
   * Runs a vault write after those already queued, cancelling it if the
   * wallet was locked or replaced in the meantime.
   *
   * @param {Function} write - Called with the vault generation to check against.
   * @returns {Promise} The write's result.
   */
  _queueVaultWrite(write) {
    const generation = this.vaultGeneration;
    const operation = this.vaultWrites.then(async () => {
      this.assertVaultGeneration(generation);
      return write(generation);
    });
    this.vaultWrites = operation.catch(() => undefined);
    return operation;
  }

  _serializeKeyrings() {
    return Promise.all(
      this.keyrings.map(async (keyring) => ({
        type: keyring.type,
        data: await serializeKeyring(keyring),
      })),
    );
  }

  /**
   * Re-encrypts the vault under a new password and a fresh salt. The current
   * password is checked against the stored vault rather than trusted. The
   * vault, the cached session key and the password in memory are replaced
   * together, and only once the new vault is fully encrypted, so a failure
   * leaves the old ones in use. Like any save, it is serialized with other
   * vault writes and cancelled by Lock.
   *
   * @param {string} oldPassword - The current password.
   * @param {string} newPassword - The password to change to.
   * @returns {Promise<boolean>} Resolves once the new vault is stored.
   */
  async changePassword(oldPassword, newPassword) {
    if (!this.memStore.getState().isUnlocked) {
      throw new Error('Unlock the wallet to change its password.');
    }
    if (typeof oldPassword !== 'string') {
      throw new Error('Password must be text.');
    }
    assertNewPassword(newPassword);
    if (newPassword === oldPassword) {
      throw new Error('The new password must differ from the current one.');
    }
    return this._queueVaultWrite(async (generation) => {
      const previousVault = this._getVault();
      try {
        await this.verifyPassword(oldPassword);
      } catch (_) {
        throw new Error(INCORRECT_PASSWORD_MESSAGE);
      }
      this.assertVaultGeneration(generation);
      const serialized = await this._serializeKeyrings();
      this.assertVaultGeneration(generation);
      let vault;
      let commit = () => () => undefined;
      if (this.encryptor.encryptWithNewPassword) {
        ({ vault, commit } = await this.encryptor.encryptWithNewPassword(
          newPassword,
          serialized,
        ));
      } else {
        vault = await this.encryptor.encrypt(newPassword, serialized);
      }
      this.assertVaultGeneration(generation);
      const previousPassword = this.password;
      const undo = commit();
      try {
        this.password = newPassword;
        this.store.updateState({ vault });
      } catch (error) {
        undo();
        this.password = previousPassword;
        this.store.updateState({ vault: previousVault });
        throw error;
      }
      // Replace the stored session key now, so a restarted service worker
      // restores the session with the new key. Should this fail, the stored
      // key no longer matches the vault's salt, and restoring starts locked.
      await this.encryptor.save?.().catch((error) => {
        log.error('Failed to store the new session key', error);
      });
      return true;
    });
  }

  /**
   * Saves the vault and then the keyrings shown in memStore, stopping if the
   * wallet is locked or replaced after either step.
   *
   * @param {number} generation - The vault generation the caller started in.
   * @param {string} [password] - The password to encrypt the vault with;
   * by default the current one when the save runs.
   */
  async _saveKeyrings(generation, password) {
    await this.persistAllKeyrings(password);
    this.assertVaultGeneration(generation);
    await this._updateMemStoreKeyrings();
    this.assertVaultGeneration(generation);
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
    const serialized = await this.encryptor.decrypt(password, this._getVault());
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
    await this._saveKeyrings(generation);
    this.fullUpdate();
    return keyring;
  }

  async checkForDuplicate(type, newAccounts) {
    if (type !== SIMPLE_KEY_PAIR) {
      return;
    }
    const accounts = await this.getAccounts();
    if (accounts.includes(normalizeAddress(newAccounts[0]))) {
      throw new Error("The account you're are trying to import is a duplicate");
    }
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
    await this._saveKeyrings(generation);
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
    await this._saveKeyrings(generation);
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
    this.assertRestorable(password, mnemonic);
    return this.createVault(password, mnemonic);
  }

  /**
   * Throws if createNewVaultAndRestore would refuse these, so callers can
   * check before they change anything.
   *
   * @param {string} password - The vault password
   * @param {string} mnemonic - The seed phrase
   */
  assertRestorable(password, mnemonic) {
    assertNewPassword(password);
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Seed phrase is invalid.');
    }
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
    assertNewPassword(password);
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
    await this._saveKeyrings(generation, password);
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
    const signature = await keyring.signTypedData(address, params.data, opts);
    assertTypedSignature({
      data: params.data,
      signature,
      version: opts.version,
      from: address,
    });
    return signature;
  }
}
