// Only the AES-GCM helpers; key derivation and its bounds stay in this file.
import * as passworder from '@metamask/browser-passworder';

import browserGlobal from './browser-global';

const SESSION_KEY = 'ecfWalletVaultKey';

// Vaults written before key metadata existed were derived with 10,000 rounds.
export const LEGACY_PBKDF2_ITERATIONS = 10000;
// Matches the current OWASP guidance for PBKDF2-HMAC-SHA256.
export const PBKDF2_ITERATIONS = 600000;

/**
 * Reads the PBKDF2 round count a vault was encrypted with. The metadata format
 * matches @metamask/browser-passworder so upgraded vaults stay portable.
 *
 * @param {object} payload - The parsed vault.
 * @returns {number} The vault's PBKDF2 iteration count.
 */
export function getVaultIterations(payload) {
  const { keyMetadata } = payload;
  if (keyMetadata === undefined) {
    return LEGACY_PBKDF2_ITERATIONS;
  }
  const iterations = keyMetadata?.params?.iterations;
  if (
    keyMetadata?.algorithm !== 'PBKDF2' ||
    !Number.isSafeInteger(iterations) ||
    iterations < LEGACY_PBKDF2_ITERATIONS
  ) {
    throw new Error('Unsupported vault key derivation.');
  }
  return iterations;
}

/**
 * Checks whether a vault needs to be re-encrypted.
 *
 * @param {string} vault - The serialized vault.
 * @returns {boolean} Whether the vault already uses the current key derivation.
 */
export function isVaultUpdated(vault) {
  return getVaultIterations(JSON.parse(vault)) >= PBKDF2_ITERATIONS;
}

/**
 * Keeps only the derived vault key in trusted, memory-only extension storage.
 * The password and decrypted keyrings are never written to browser storage.
 * Session storage is cleared by the browser on exit, extension reload or update.
 */
export default class SessionEncryptor {
  constructor(storage) {
    this.storage = storage;
    this.sessionPassword = browserGlobal.crypto.randomUUID();
    this.cached = null;
    this.key = null;
    this.writes = Promise.resolve();
    this.generation = 0;
  }

  async restore(vault) {
    const { generation } = this;
    if (!this.storage || !vault) {
      return false;
    }
    await this.storage.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
    const saved = (await this.storage.get(SESSION_KEY))[SESSION_KEY];
    this.assertGeneration(generation);
    if (!saved || saved.salt !== JSON.parse(vault).salt) {
      await this.clear();
      return false;
    }
    try {
      const payload = JSON.parse(vault);
      const key = await browserGlobal.crypto.subtle.importKey(
        'jwk',
        saved.key,
        'AES-GCM',
        true,
        ['encrypt', 'decrypt'],
      );
      // Validate against the persisted vault before attempting session unlock.
      await passworder.decryptWithKey(key, payload);
      this.assertGeneration(generation);
      this.key = key;
      this.cached = { ...saved, iterations: getVaultIterations(payload) };
      return true;
    } catch (_) {
      if (generation === this.generation) {
        await this.clear();
      }
      return false;
    }
  }

  /**
   * Encrypts with the cached session key, keeping its salt and round count, or
   * derives a fresh key at the current round count from a real password.
   *
   * @param {string} password - The password, or the session password to use the cached key.
   * @param {*} data - The data to encrypt.
   * @returns {Promise<string>} The serialized vault.
   */
  async encrypt(password, data) {
    const { generation } = this;
    const useSession = password === this.sessionPassword && this.cached;
    const salt = useSession ? this.cached.salt : passworder.generateSalt();
    const iterations = useSession ? this.cached.iterations : PBKDF2_ITERATIONS;
    const key = await this.getKey(password, salt, iterations);
    const payload = await passworder.encryptWithKey(key, data);
    await this.remember(key, salt, iterations, generation);
    return JSON.stringify({
      ...payload,
      salt,
      ...vaultKeyMetadata(iterations),
    });
  }

  async decrypt(password, vault) {
    const { generation } = this;
    const payload = JSON.parse(vault);
    const iterations = getVaultIterations(payload);
    const key = await this.getKey(password, payload.salt, iterations);
    const data = await passworder.decryptWithKey(key, payload);
    await this.remember(key, payload.salt, iterations, generation);
    return data;
  }

  /**
   * Checks a password against the vault without keeping the derived key.
   * Unlike decrypt, it leaves the cached key alone, so checking a password
   * while the wallet is locked does not leave the vault key in memory.
   *
   * @param {string} password - The password to check.
   * @param {string} vault - The serialized vault.
   * @throws {Error} If the password does not decrypt the vault.
   */
  async verify(password, vault) {
    const payload = JSON.parse(vault);
    const key = await this.getKey(
      password,
      payload.salt,
      getVaultIterations(payload),
    );
    await passworder.decryptWithKey(key, payload);
  }

  isVaultUpdated(vault) {
    return isVaultUpdated(vault);
  }

  async getKey(password, salt, iterations) {
    if (typeof password !== 'string') {
      throw new Error('Password must be text.');
    }
    if (password === this.sessionPassword) {
      if (
        !this.key ||
        salt !== this.cached?.salt ||
        iterations !== this.cached?.iterations
      ) {
        throw new Error('Wallet session expired. Unlock the wallet again.');
      }
      return this.key;
    }
    const { subtle } = browserGlobal.crypto;
    const material = await subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: Uint8Array.from(browserGlobal.atob(salt), (char) =>
          char.charCodeAt(0),
        ),
        iterations,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  assertGeneration(generation) {
    if (generation !== this.generation) {
      throw new Error(
        'Wallet operation cancelled because the wallet was locked or replaced.',
      );
    }
  }

  async remember(key, salt, iterations, generation = this.generation) {
    const serializedKey = await browserGlobal.crypto.subtle.exportKey(
      'jwk',
      key,
    );
    this.assertGeneration(generation);
    this.key = key;
    this.cached = { key: serializedKey, salt, iterations };
  }

  async save() {
    if (this.storage && this.cached) {
      const saved = this.cached;
      this.writes = this.writes
        .catch(() => undefined)
        .then(() => this.storage.set({ [SESSION_KEY]: saved }));
      await this.writes;
    }
  }

  async clear() {
    this.generation += 1;
    this.key = null;
    this.cached = null;
    if (this.storage) {
      this.writes = this.writes
        .catch(() => undefined)
        .then(() => this.storage.remove(SESSION_KEY));
      await this.writes;
    }
  }
}

function vaultKeyMetadata(iterations) {
  // Legacy vaults stay in their original format until a password unlock upgrades them.
  return iterations === LEGACY_PBKDF2_ITERATIONS
    ? {}
    : { keyMetadata: { algorithm: 'PBKDF2', params: { iterations } } };
}
