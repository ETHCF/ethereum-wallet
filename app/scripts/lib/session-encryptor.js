import passworder from 'browser-passworder'
import browserGlobal from './browser-global'

const SESSION_KEY = 'ecfWalletVaultKey'

/**
 * Keeps only the derived vault key in trusted, memory-only extension storage.
 * The password and decrypted keyrings are never written to browser storage.
 * Session storage is cleared by the browser on exit, extension reload or update.
 */
export default class SessionEncryptor {
  constructor (storage) {
    this.storage = storage
    this.sessionPassword = browserGlobal.crypto.randomUUID()
    this.cached = null
    this.key = null
    this.writes = Promise.resolve()
    this.generation = 0
  }

  async restore (vault) {
    if (!this.storage || !vault) {
      return false
    }
    await this.storage.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
    const saved = (await this.storage.get(SESSION_KEY))[SESSION_KEY]
    if (!saved || saved.salt !== JSON.parse(vault).salt) {
      await this.clear()
      return false
    }
    try {
      this.key = await browserGlobal.crypto.subtle.importKey('jwk', saved.key, 'AES-GCM', true, ['encrypt', 'decrypt'])
      this.cached = saved
      // Validate against the persisted vault before attempting session unlock.
      await passworder.decryptWithKey(this.key, JSON.parse(vault))
      return true
    } catch (_) {
      await this.clear()
      return false
    }
  }

  async encrypt (password, data) {
    const salt = password === this.sessionPassword && this.cached
      ? this.cached.salt
      : passworder.generateSalt()
    const key = await this.getKey(password, salt)
    const payload = await passworder.encryptWithKey(key, data)
    await this.remember(key, salt)
    return JSON.stringify({ ...payload, salt })
  }

  async decrypt (password, vault) {
    const payload = JSON.parse(vault)
    const key = await this.getKey(password, payload.salt)
    const data = await passworder.decryptWithKey(key, payload)
    await this.remember(key, payload.salt)
    return data
  }

  async getKey (password, salt) {
    if (password === this.sessionPassword) {
      if (!this.key || salt !== this.cached?.salt) {
        throw new Error('Wallet session expired. Unlock the wallet again.')
      }
      return this.key
    }
    const { subtle } = browserGlobal.crypto
    const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
    return subtle.deriveKey({
      name: 'PBKDF2',
      salt: Uint8Array.from(browserGlobal.atob(salt), (char) => char.charCodeAt(0)),
      // Preserve the existing vault format so existing wallets remain readable.
      iterations: 10000,
      hash: 'SHA-256',
    }, material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  }

  async remember (key, salt) {
    const { generation } = this
    const serializedKey = await browserGlobal.crypto.subtle.exportKey('jwk', key)
    if (generation === this.generation) {
      this.key = key
      this.cached = { key: serializedKey, salt }
    }
  }

  async save () {
    if (this.storage && this.cached) {
      const saved = this.cached
      this.writes = this.writes.catch(() => undefined).then(() => this.storage.set({ [SESSION_KEY]: saved }))
      await this.writes
    }
  }

  async clear () {
    this.generation += 1
    this.key = null
    this.cached = null
    if (this.storage) {
      this.writes = this.writes.catch(() => undefined).then(() => this.storage.remove(SESSION_KEY))
      await this.writes
    }
  }
}
