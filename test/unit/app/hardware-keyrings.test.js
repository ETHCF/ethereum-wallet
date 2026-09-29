import { strict as assert } from 'assert'
import Transaction from 'ethereumjs-tx'
import { createRemoteKeyring } from '../../../app/scripts/lib/hardware-keyrings'

describe('Manifest V3 hardware transport', function () {
  it('preserves the transaction fields and chain ID across the message boundary', async function () {
    const privateKey = Buffer.from('1'.repeat(64), 'hex')
    const original = new Transaction({
      nonce: '0x01', gasPrice: '0x04a817c800', gasLimit: '0x5208',
      to: `0x${'2'.repeat(40)}`, value: '0x01', chainId: 1337,
    })
    const Keyring = createRemoteKeyring('Ledger Hardware', async ({ method, args, state }) => {
      assert.equal(method, 'signTransaction')
      const transaction = new Transaction(JSON.parse(JSON.stringify(args[1])))
      assert.equal(transaction.getChainId(), 1337)
      assert.deepEqual(transaction.raw, original.raw)
      transaction.sign(privateKey)
      return { result: transaction.serialize().toString('hex'), state, unlocked: true }
    })
    const keyring = new Keyring({ accounts: [] })
    const signed = await keyring.signTransaction('address', original)
    assert.equal(signed.getChainId(), 1337)
    assert.equal(signed.verifySignature(), true)
    assert.equal(keyring.isUnlocked(), true)
  })

  it('keeps account selection and returned public state available for vault persistence', async function () {
    const Keyring = createRemoteKeyring('Trezor Hardware', async ({ method, state }) => {
      assert.equal(method, 'addAccounts')
      assert.equal(state.unlockedAccount, 7)
      return { result: ['0x1234'], state: { ...state, accounts: ['0x1234'] }, unlocked: true }
    })
    const keyring = new Keyring()
    keyring.setAccountToUnlock(7)
    await keyring.addAccounts(1)
    assert.deepEqual(await keyring.getAccounts(), ['0x1234'])
    assert.deepEqual((await keyring.serialize()).accounts, ['0x1234'])
    keyring.forgetDevice()
    assert.deepEqual(await keyring.getAccounts(), [])
    assert.equal(keyring.isUnlocked(), false)
  })
})
