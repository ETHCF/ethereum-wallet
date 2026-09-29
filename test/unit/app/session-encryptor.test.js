import { strict as assert } from 'assert'
import { webcrypto } from 'crypto'
import passworder from 'browser-passworder'
import SessionEncryptor from '../../../app/scripts/lib/session-encryptor'
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
})
