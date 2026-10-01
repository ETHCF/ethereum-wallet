import { strict as assert } from 'assert'
import { webcrypto } from 'crypto'
import passworder from 'browser-passworder'
import SessionEncryptor from '../../../app/scripts/lib/session-encryptor'
import KeyringController from '../../../app/scripts/lib/modern-keyring-controller'
import browserGlobal from '../../../app/scripts/lib/browser-global'

function deferred () {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const key = Buffer.alloc(32, 1).toString('hex')
const contents = [{ type: 'Simple Key Pair', data: [key] }]
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('Vault lifecycle races', function () {
  let cryptoDescriptor
  before(function () {
    cryptoDescriptor = Object.getOwnPropertyDescriptor(browserGlobal, 'crypto')
    Object.defineProperty(browserGlobal, 'crypto', { value: webcrypto, configurable: true })
  })
  after(function () {
    Object.defineProperty(browserGlobal, 'crypto', cryptoDescriptor)
  })

  it('cancels a save on lock and retains the vault encrypted with the original password', async function () {
    const encryptor = new SessionEncryptor()
    const vault = await encryptor.encrypt('password', contents)
    const controller = new KeyringController({ initState: { vault }, encryptor })
    controller.on('lock', () => encryptor.clear())
    await controller.submitPassword('password')
    const cancelled = assert.rejects(controller.persistAllKeyrings(), /cancelled/u)
    await controller.setLocked()
    await cancelled
    assert.equal(controller.store.getState().vault, vault)
    assert.deepEqual(await new SessionEncryptor().decrypt('password', vault), contents)
    await assert.rejects(new SessionEncryptor().decrypt('null', vault))
    assert.equal(controller.memStore.getState().isUnlocked, false)
  })

  it('serializes concurrent imports so an old encryption cannot erase a newer account', async function () {
    const started = deferred()
    const finish = deferred()
    let calls = 0
    const controller = new KeyringController({
      encryptor: {
        encrypt: async (_, data) => {
          const snapshot = JSON.stringify(data)
          calls += 1
          if (calls === 1) {
            started.resolve()
            await finish.promise
          }
          return snapshot
        },
      },
    })
    controller.password = 'password'
    const first = controller.addNewKeyring('Simple Key Pair', [key])
    await started.promise
    const second = controller.addNewKeyring('Simple Key Pair', [Buffer.alloc(32, 2).toString('hex')])
    await flush()
    assert.equal(calls, 1)
    finish.resolve()
    await Promise.all([first, second])
    assert.equal(JSON.parse(controller.store.getState().vault).length, 2)
    assert.equal((await controller.getAccounts()).length, 2)
  })

  it('does not restore accounts or session keys when an older unlock finishes after Lock', async function () {
    const values = {}
    const encryptor = new SessionEncryptor({
      set: async (data) => Object.assign(values, data),
      remove: async (name) => {
        delete values[name]
      },
    })
    const vault = await passworder.encrypt('password', contents)
    const controller = new KeyringController({ initState: { vault }, encryptor })
    controller.on('lock', () => encryptor.clear())
    controller.memStore.subscribe(({ isUnlocked }) => {
      if (isUnlocked) {
        encryptor.save()
      }
    })
    const ready = deferred()
    const finish = deferred()
    const getKey = encryptor.getKey.bind(encryptor)
    encryptor.getKey = async (...args) => {
      const result = await getKey(...args)
      ready.resolve()
      await finish.promise
      return result
    }
    const cancelled = assert.rejects(controller.submitPassword('password'), /cancelled/u)
    await ready.promise
    await controller.setLocked()
    finish.resolve()
    await cancelled
    await encryptor.writes
    assert.equal(controller.memStore.getState().isUnlocked, false)
    assert.deepEqual(await controller.getAccounts(), [])
    assert.equal(encryptor.key, null)
    assert.deepEqual(values, {})
    // A new, deliberate unlock after cancellation must still work.
    await controller.submitPassword('password')
    assert.equal(controller.memStore.getState().isUnlocked, true)
    assert.equal((await controller.getAccounts()).length, 1)
  })

  it('discards encryption already in flight when Lock occurs', async function () {
    const ready = deferred()
    const finish = deferred()
    const controller = new KeyringController({
      initState: { vault: 'original' }, encryptor: {
        encrypt: async () => {
          ready.resolve()
          await finish.promise
          return 'stale vault'
        },
      },
    })
    controller.password = 'password'
    const cancelled = assert.rejects(controller.persistAllKeyrings(), /cancelled/u)
    await ready.promise
    await controller.setLocked()
    finish.resolve()
    await cancelled
    assert.equal(controller.store.getState().vault, 'original')
    assert.equal(controller.password, null)
  })

  it('continues saving after an encryption failure', async function () {
    let calls = 0
    const controller = new KeyringController({
      encryptor: {
        encrypt: async () => {
          calls += 1
          if (calls === 1) {
            throw new Error('Encryption failed')
          }
          return 'saved'
        },
      },
    })
    await assert.rejects(controller.persistAllKeyrings('password'), /Encryption failed/u)
    await controller.persistAllKeyrings('password')
    assert.equal(controller.store.getState().vault, 'saved')
  })

  it('rejects non-text passwords instead of coercing them into predictable keys', async function () {
    const encryptor = new SessionEncryptor()
    await assert.rejects(encryptor.encrypt(null, contents), /Password must be text/u)
    await assert.rejects(encryptor.encrypt(undefined, contents), /Password must be text/u)
  })

  it('does not restore keyrings when account removal finishes after Lock', async function () {
    const finish = deferred()
    const controller = new KeyringController({})
    controller.keyrings = [{ getAccounts: () => finish.promise }]
    const cancelled = assert.rejects(controller.removeEmptyKeyrings(), /cancelled/u)
    await controller.setLocked()
    finish.resolve(['account'])
    await cancelled
    assert.deepEqual(controller.keyrings, [])
    assert.deepEqual(controller.memStore.getState().keyrings, [])
  })

  it('does not announce or save an account added after Lock', async function () {
    const finish = deferred()
    const controller = new KeyringController({})
    let announced = false
    controller.on('newAccount', () => {
      announced = true
    })
    const cancelled = assert.rejects(controller.addNewAccount({ addAccounts: () => finish.promise }), /cancelled/u)
    await controller.setLocked()
    finish.resolve(['account'])
    await cancelled
    assert.equal(announced, false)
    assert.equal(controller.store.getState().vault, undefined)
  })

  it('keeps the latest account display when an older display update finishes last', async function () {
    const finish = deferred()
    const controller = new KeyringController({})
    const keyring = { type: 'test', getAccounts: () => finish.promise }
    controller.keyrings = [keyring]
    const older = controller._updateMemStoreKeyrings()
    keyring.getAccounts = async () => ['0x02']
    await controller._updateMemStoreKeyrings()
    finish.resolve(['0x01'])
    await older
    assert.deepEqual(controller.memStore.getState().keyrings, [{ type: 'test', accounts: ['0x02'] }])
  })

  it('cancels wallet creation before it can unlock after Lock', async function () {
    const started = deferred()
    const finish = deferred()
    const controller = new KeyringController({
      initState: { vault: 'original' },
      encryptor: {
        encrypt: async () => {
          started.resolve()
          await finish.promise
          return 'replacement'
        },
      },
    })
    const cancelled = assert.rejects(controller.createNewVaultAndKeychain('password'), /cancelled/u)
    await started.promise
    await controller.setLocked()
    finish.resolve()
    await cancelled
    assert.equal(controller.store.getState().vault, 'original')
    assert.equal(controller.memStore.getState().isUnlocked, false)
    assert.deepEqual(controller.keyrings, [])
  })
})
