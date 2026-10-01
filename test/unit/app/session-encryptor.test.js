import { strict as assert } from 'assert'
import { webcrypto } from 'crypto'
import passworder from '../../lib/legacy-passworder'
import SessionEncryptor, { PBKDF2_ITERATIONS, isVaultUpdated } from '../../../app/scripts/lib/session-encryptor'
import KeyringController from '../../../app/scripts/lib/modern-keyring-controller'
import browserGlobal from '../../../app/scripts/lib/browser-global'

describe('Manifest V3 vault sessions', function () {
  let cryptoDescriptor
  let values
  let storage

  before(function () {
    cryptoDescriptor = Object.getOwnPropertyDescriptor(browserGlobal, 'crypto')
    Object.defineProperty(browserGlobal, 'crypto', { value: webcrypto, configurable: true })
  })

  after(function () {
    Object.defineProperty(browserGlobal, 'crypto', cryptoDescriptor)
  })

  beforeEach(function () {
    values = {}
    storage = {
      async get (key) {
        return { [key]: values[key] }
      },
      async set (data) {
        Object.assign(values, data)
      },
      async remove (key) {
        delete values[key]
      },
      async setAccessLevel ({ accessLevel }) {
        assert.equal(accessLevel, 'TRUSTED_CONTEXTS')
      },
    }
  })

  it('reads existing vaults and restores an unlocked session without storing the password', async function () {
    const contents = [{ type: 'test', data: { secret: 'private-key' } }]
    const vault = await passworder.encrypt('test-password', contents)
    const first = new SessionEncryptor(storage)
    assert.deepEqual(await first.decrypt('test-password', vault), contents)
    assert.deepEqual(values, {}, 'password verification alone must not persist an unlock key')
    await first.save()
    assert.ok(!JSON.stringify(values).includes('test-password'))
    assert.ok(!JSON.stringify(values).includes('private-key'))

    const restarted = new SessionEncryptor(storage)
    assert.equal(await restarted.restore(vault), true)
    assert.deepEqual(await restarted.decrypt(restarted.sessionPassword, vault), contents)
    const changed = [...contents, { type: 'another', data: {} }]
    const updatedVault = await restarted.encrypt(restarted.sessionPassword, changed)
    assert.deepEqual(await passworder.decrypt('test-password', updatedVault), changed)
  })

  it('clears the session on lock and refuses a session for a different vault', async function () {
    const encryptor = new SessionEncryptor(storage)
    const vault = await encryptor.encrypt('password', [])
    await encryptor.save()
    await encryptor.clear()
    assert.equal(await new SessionEncryptor(storage).restore(vault), false)
    await assert.rejects(encryptor.decrypt(encryptor.sessionPassword, vault), /session expired/u)

    await encryptor.decrypt('password', vault)
    await encryptor.save()
    const differentVault = await passworder.encrypt('different-password', [])
    assert.equal(await new SessionEncryptor(storage).restore(differentVault), false)
    assert.deepEqual(values, {})
  })

  it('does not cache a key after an incorrect password', async function () {
    const vault = await passworder.encrypt('correct', [])
    const encryptor = new SessionEncryptor(storage)
    await assert.rejects(encryptor.decrypt('incorrect', vault), /Incorrect password/u)
    await encryptor.save()
    assert.deepEqual(values, {})
  })

  it('derives new vault keys with 600,000 PBKDF2 rounds and records them in the vault', async function () {
    const encryptor = new SessionEncryptor(storage)
    const vault = await encryptor.encrypt('password', [{ secret: 1 }])
    assert.deepEqual(JSON.parse(vault).keyMetadata, { algorithm: 'PBKDF2', params: { iterations: PBKDF2_ITERATIONS } })
    assert.equal(isVaultUpdated(vault), true)
    await assert.rejects(passworder.decrypt('password', vault), /Incorrect password/u, 'legacy round counts must not open the new vault')
    assert.deepEqual(await new SessionEncryptor().decrypt('password', vault), [{ secret: 1 }])

    await encryptor.save()
    const restarted = new SessionEncryptor(storage)
    assert.equal(await restarted.restore(vault), true)
    const updated = await restarted.encrypt(restarted.sessionPassword, [{ secret: 2 }])
    assert.equal(JSON.parse(updated).keyMetadata.params.iterations, PBKDF2_ITERATIONS)
    assert.deepEqual(await new SessionEncryptor().decrypt('password', updated), [{ secret: 2 }])
  })

  it('rejects vaults with unsupported or weakened key derivation metadata', async function () {
    const vault = JSON.parse(await new SessionEncryptor().encrypt('password', []))
    for (const keyMetadata of [
      { algorithm: 'scrypt', params: { iterations: PBKDF2_ITERATIONS } },
      { algorithm: 'PBKDF2', params: { iterations: 1 } },
      { algorithm: 'PBKDF2', params: { iterations: '600000' } },
      null,
    ]) {
      await assert.rejects(new SessionEncryptor().decrypt('password', JSON.stringify({ ...vault, keyMetadata })), /Unsupported vault key derivation/u)
    }
  })

  it('upgrades a legacy vault when unlocked with the password, but not from a restored session', async function () {
    const contents = [{ type: 'Simple Key Pair', data: [Buffer.alloc(32, 1).toString('hex')] }]
    const legacyVault = await passworder.encrypt('password', contents)
    assert.equal(isVaultUpdated(legacyVault), false)

    const sessionEncryptor = new SessionEncryptor(storage)
    await sessionEncryptor.decrypt('password', legacyVault)
    await sessionEncryptor.save()
    const restored = new SessionEncryptor(storage)
    assert.equal(await restored.restore(legacyVault), true)
    const sessionController = new KeyringController({ initState: { vault: legacyVault }, encryptor: restored })
    await sessionController.submitPassword(restored.sessionPassword)
    assert.equal(isVaultUpdated(sessionController.store.getState().vault), false)

    const encryptor = new SessionEncryptor()
    const controller = new KeyringController({ initState: { vault: legacyVault }, encryptor })
    await controller.submitPassword('password')
    assert.equal(controller.memStore.getState().isUnlocked, true)
    await controller.vaultWrites
    const upgraded = controller.store.getState().vault
    assert.equal(isVaultUpdated(upgraded), true)
    assert.notEqual(JSON.parse(upgraded).salt, JSON.parse(legacyVault).salt)
    assert.deepEqual(await new SessionEncryptor().decrypt('password', upgraded), contents)
    assert.equal((await controller.getAccounts()).length, 1)
  })
})
