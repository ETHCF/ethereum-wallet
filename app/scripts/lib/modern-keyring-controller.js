import KeyringController from 'eth-keyring-controller'
import { validateMnemonic } from 'bip39'
import { signTypedData } from './signing-utils'

// Preserve the vault format and account derivation while guarding the legacy
// controller's asynchronous writes and unlocks against wallet lifecycle changes.
export default class ModernKeyringController extends KeyringController {
  constructor (opts) {
    super(opts)
    this.vaultGeneration = 0
    this.vaultWrites = Promise.resolve()
    this.keyringDisplayRequest = 0
  }

  assertVaultGeneration (generation) {
    if (generation !== this.vaultGeneration) {
      throw new Error('Wallet operation cancelled because the wallet was locked or replaced.')
    }
  }

  async setLocked () {
    this.vaultGeneration += 1
    this.password = null
    this.keyrings = []
    this.memStore.updateState({ isUnlocked: false, keyrings: [] })
    // Notify synchronously so session keys and hardware requests are invalidated
    // before any pending promise can restore them.
    this.emit('lock')
    return this.fullUpdate()
  }

  persistAllKeyrings (password = this.password) {
    const generation = this.vaultGeneration
    const operation = this.vaultWrites.then(async () => {
      this.assertVaultGeneration(generation)
      if (typeof password !== 'string') {
        throw new Error('KeyringController - password is not a string')
      }
      const serialized = await Promise.all(this.keyrings.map(async (keyring) => ({
        type: keyring.type, data: await keyring.serialize(),
      })))
      this.assertVaultGeneration(generation)
      const vault = await this.encryptor.encrypt(password, serialized)
      this.assertVaultGeneration(generation)
      this.password = password
      this.store.updateState({ vault })
      return true
    })
    this.vaultWrites = operation.catch(() => undefined)
    return operation
  }

  async submitPassword (password) {
    this.vaultGeneration += 1
    const generation = this.vaultGeneration
    await this.unlockKeyrings(password)
    this.assertVaultGeneration(generation)
    this.setUnlocked()
    return this.fullUpdate()
  }

  async unlockKeyrings (password) {
    const generation = this.vaultGeneration
    await this.vaultWrites
    this.assertVaultGeneration(generation)
    const { vault } = this.store.getState()
    if (!vault) {
      throw new Error('Cannot unlock without a previous vault.')
    }
    const serialized = await this.encryptor.decrypt(password, vault)
    this.assertVaultGeneration(generation)
    const keyrings = await Promise.all(serialized.map(async ({ type, data }) => {
      const Keyring = this.getKeyringClassForType(type)
      const keyring = new Keyring()
      await keyring.deserialize(data)
      await keyring.getAccounts()
      return keyring
    }))
    this.assertVaultGeneration(generation)
    this.password = password
    this.keyrings = keyrings
    await this._updateMemStoreKeyrings()
    this.assertVaultGeneration(generation)
    return keyrings
  }

  async addNewKeyring (type, opts) {
    const generation = this.vaultGeneration
    const Keyring = this.getKeyringClassForType(type)
    const keyring = new Keyring(opts)
    const accounts = await keyring.getAccounts()
    await this.checkForDuplicate(type, accounts)
    this.assertVaultGeneration(generation)
    this.keyrings.push(keyring)
    await this.persistAllKeyrings()
    this.assertVaultGeneration(generation)
    await this._updateMemStoreKeyrings()
    this.assertVaultGeneration(generation)
    this.fullUpdate()
    return keyring
  }

  async _updateMemStoreKeyrings () {
    const generation = this.vaultGeneration
    const current = this.keyrings
    this.keyringDisplayRequest += 1
    const request = this.keyringDisplayRequest
    const keyrings = await Promise.all(current.map(this.displayForKeyring))
    if (generation === this.vaultGeneration && current === this.keyrings && request === this.keyringDisplayRequest) {
      this.memStore.updateState({ keyrings })
    }
    return this.memStore.getState()
  }

  async addNewAccount (keyring) {
    const generation = this.vaultGeneration
    const accounts = await keyring.addAccounts(1)
    this.assertVaultGeneration(generation)
    accounts.forEach((account) => this.emit('newAccount', account))
    await this.persistAllKeyrings()
    this.assertVaultGeneration(generation)
    await this._updateMemStoreKeyrings()
    this.assertVaultGeneration(generation)
    return this.fullUpdate()
  }

  async removeAccount (address) {
    const generation = this.vaultGeneration
    const keyring = await this.getKeyringForAccount(address)
    this.assertVaultGeneration(generation)
    if (typeof keyring.removeAccount !== 'function') {
      throw new Error(`Keyring ${keyring.type} doesn't support account removal operations`)
    }
    await keyring.removeAccount(address)
    this.assertVaultGeneration(generation)
    this.emit('removedAccount', address)
    await this.removeEmptyKeyrings()
    this.assertVaultGeneration(generation)
    await this.persistAllKeyrings()
    this.assertVaultGeneration(generation)
    await this._updateMemStoreKeyrings()
    this.assertVaultGeneration(generation)
    return this.fullUpdate()
  }

  async removeEmptyKeyrings () {
    const generation = this.vaultGeneration
    const empty = new Set()
    await Promise.all(this.keyrings.map(async (keyring) => {
      if ((await keyring.getAccounts()).length === 0) {
        empty.add(keyring)
      }
    }))
    this.assertVaultGeneration(generation)
    // Retain keyrings imported while the account checks were pending.
    this.keyrings = this.keyrings.filter((keyring) => !empty.has(keyring))
  }

  async createNewVaultAndKeychain (password) {
    return this.createVault(password, { numberOfAccounts: 1 }, true)
  }

  async createNewVaultAndRestore (password, mnemonic) {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('Seed phrase is invalid.')
    }
    return this.createVault(password, { mnemonic, numberOfAccounts: 1 })
  }

  async createVault (password, opts, notify = false) {
    if (typeof password !== 'string') {
      throw new Error('Password must be text.')
    }
    this.vaultGeneration += 1
    const generation = this.vaultGeneration
    await this.encryptor.clear?.()
    await this.vaultWrites
    this.assertVaultGeneration(generation)
    const Keyring = this.getKeyringClassForType('HD Key Tree')
    const keyring = new Keyring(opts)
    const [address] = await keyring.getAccounts()
    this.assertVaultGeneration(generation)
    if (!address) {
      throw new Error('KeyringController - No account found on keychain.')
    }
    this.keyrings = [keyring]
    await this.persistAllKeyrings(password)
    this.assertVaultGeneration(generation)
    await this._updateMemStoreKeyrings()
    this.assertVaultGeneration(generation)
    if (notify) {
      this.emit('newVault', address)
    }
    this.setUnlocked()
    return this.fullUpdate()
  }

  async signTypedMessage (params, opts = { version: 'V1' }) {
    const keyring = await this.getKeyringForAccount(params.from)
    if (['HD Key Tree', 'Simple Key Pair'].includes(keyring.type)) {
      return signTypedData({
        privateKey: keyring.getPrivateKeyFor(params.from), data: params.data, version: opts.version,
      })
    }
    return super.signTypedMessage(params, opts)
  }
}
