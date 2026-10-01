import { strict as assert } from 'assert'
import { recoverPersonalSignature, recoverTypedSignature, SignTypedDataVersion } from '@metamask/eth-sig-util'
import KeyringController from '../../../app/scripts/lib/modern-keyring-controller'
import SessionEncryptor, { isVaultUpdated } from '../../../app/scripts/lib/session-encryptor'
import seedPhraseVerifier from '../../../app/scripts/lib/seed-phrase-verifier'
import legacyPassworder from '../../lib/legacy-passworder'
import fixtures from '../../fixtures/vaults/old-keyring-stack.json'
import personalSignState from '../../e2e/fixtures/personal-sign/state.json'

// The fixtures were written by eth-keyring-controller 6, eth-hd-keyring 3.6,
// eth-simple-keyring 4 and browser-passworder 2: the stack this controller replaces.

const { password, mnemonic, simpleKey } = fixtures

function memoryStorage () {
  const values = {}
  return {
    get: async (key) => ({ [key]: values[key] }),
    set: async (data) => Object.assign(values, data),
    remove: async (key) => {
      delete values[key]
    },
    setAccessLevel: async () => undefined,
  }
}

async function unlock (vault, encryptor = new SessionEncryptor(memoryStorage())) {
  const controller = new KeyringController({ initState: { vault }, encryptor })
  await controller.submitPassword(password)
  return controller
}

describe('Vaults written by the previous keyring stack', function () {
  // eslint-disable-next-line babel/no-invalid-this
  this.timeout(20000)

  for (const name of ['legacy10k', 'session600k']) {
    it(`unlocks the ${name} vault with the same accounts in the same order`, async function () {
      const controller = await unlock(fixtures[name].vault)
      assert.deepEqual(await controller.getAccounts(), fixtures[name].accounts)
      assert.deepEqual(controller.memStore.getState().keyrings.map(({ type }) => type), ['HD Key Tree', 'Simple Key Pair'])
      const simpleAccount = fixtures[name].accounts[2]
      assert.equal(await controller.exportAccount(simpleAccount), simpleKey)
    })
  }

  it('unlocks a real wallet vault from the e2e fixtures', async function () {
    const { vault } = personalSignState.data.KeyringController
    const controller = await unlock(vault)
    assert.deepEqual(await controller.getAccounts(), ['0x5cfe73b6021e818b776b421b1c4db2474086a7e1'])
  })

  it('upgrades the key derivation but keeps the keyring format older builds read', async function () {
    const encryptor = new SessionEncryptor(memoryStorage())
    const controller = await unlock(fixtures.legacy10k.vault, encryptor)
    await controller.vaultWrites
    const { vault } = controller.store.getState()
    assert.ok(isVaultUpdated(vault), 'the vault is re-encrypted with the current key derivation')
    const keyrings = await new SessionEncryptor(memoryStorage()).decrypt(password, vault)
    assert.deepEqual(keyrings, fixtures.legacy10k.keyrings)
    assert.equal(typeof keyrings[0].data.mnemonic, 'string')
  })

  it('writes vaults the previous encryption can still decrypt', async function () {
    const controller = new KeyringController({ encryptor: legacyPassworder })
    await controller.createNewVaultAndRestore(password, mnemonic)
    const keyrings = await legacyPassworder.decrypt(password, controller.store.getState().vault)
    assert.deepEqual(keyrings, [{ type: 'HD Key Tree', data: { mnemonic, numberOfAccounts: 1, hdPath: "m/44'/60'/0'/0" } }])
  })

  it('signs with the restored keys', async function () {
    const controller = await unlock(fixtures.legacy10k.vault)
    const [hdAccount, , simpleAccount] = fixtures.legacy10k.accounts
    for (const from of [hdAccount, simpleAccount]) {
      const data = '0x68656c6c6f'
      const signature = await controller.signPersonalMessage({ from, data })
      assert.equal(recoverPersonalSignature({ data, signature }), from)
      const typed = {
        types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Greeting: [{ name: 'text', type: 'string' }] },
        primaryType: 'Greeting', domain: { chainId: 1 }, message: { text: 'hello' },
      }
      const typedSignature = await controller.signTypedMessage({ from, data: typed }, { version: 'V4' })
      assert.equal(recoverTypedSignature({ data: typed, signature: typedSignature, version: SignTypedDataVersion.V4 }), from)
    }
  })

  it('verifies the seed phrase from a restored HD keyring', async function () {
    const controller = await unlock(fixtures.legacy10k.vault)
    const [hd] = controller.getKeyringsByType('HD Key Tree')
    await seedPhraseVerifier.verifyAccounts(await hd.getAccounts(), mnemonic)
  })
})
