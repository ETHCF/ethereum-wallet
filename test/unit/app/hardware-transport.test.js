import { strict as assert } from 'assert'
import sinon from 'sinon'
import Transaction from 'ethereumjs-tx'
import EthereumHDKey from 'ethereumjs-wallet/hdkey'
import { toChecksumAddress } from 'ethereumjs-util'
import sigUtil from 'eth-sig-util'
import { TrezorKeyring } from '@metamask/eth-trezor-keyring'
import { LedgerKeyring } from '@metamask/eth-ledger-bridge-keyring'
import { createTransaction, decodeTransaction } from '../../../app/scripts/lib/transaction-codec'
import { createRemoteKeyring } from '../../../app/scripts/lib/hardware-keyrings'
import { createHardwareRequestHandler } from '../../../app/scripts/lib/hardware-transport'

const root = EthereumHDKey.fromMasterSeed(Buffer.alloc(32, 1))
const ledgerPath = "m/44'/60'/0'"
const trezorPath = "m/44'/60'/0'/0"

function publicKey (path) {
  const node = root.derivePath(path.startsWith('m/') ? path : `m/${path}`)
  return {
    publicKey: Buffer.from(node._hdkey.publicKey).toString('hex'),
    chainCode: Buffer.from(node._hdkey.chainCode).toString('hex'),
    address: node.getWallet().getAddressString(),
  }
}

function signTransaction (path, data) {
  const typed = typeof data === 'string' ? ['01', '02'].includes(data.slice(0, 2)) : Number(data.type) > 0
  if (typed) {
    const unsigned = typeof data === 'string' ? decodeTransaction(data, 1337) : createTransaction(data, 1337)
    const signed = unsigned.sign(root.derivePath(path).getWallet().getPrivateKey())
    return { v: signed.v.toString(16).padStart(2, '0'), r: signed.r.toString(16).padStart(64, '0'), s: signed.s.toString(16).padStart(64, '0') }
  }
  const tx = typeof data === 'string' ? new Transaction(Buffer.from(data, 'hex')) : new Transaction(data)
  // Ledger sends the EIP-155 signing payload, whose v is the chain ID.
  if (typeof data === 'string') {
    tx._chainId = parseInt(tx.v.toString('hex'), 16)
  }
  tx.sign(root.derivePath(path).getWallet().getPrivateKey())
  return { v: tx.v.toString('hex'), r: tx.r.toString('hex'), s: tx.s.toString('hex') }
}

function signMessage (path, data, typed = false) {
  const key = root.derivePath(path).getWallet().getPrivateKey()
  return typed ? sigUtil.signTypedData_v4(key, { data }) : sigUtil.personalSign(key, { data })
}

function ledgerSignature (signature) {
  return { r: signature.slice(2, 66), s: signature.slice(66, 130), v: parseInt(signature.slice(130), 16) }
}

function setupHardware (kind, opts = {}) {
  const isLedger = kind === 'ledger'
  const bridge = {
    init: sinon.stub().resolves(),
    destroy: sinon.stub().resolves(),
    dispose: sinon.stub().resolves(),
    getPublicKey: sinon.stub().callsFake(async ({ path, hdPath }) => {
      const payload = publicKey(path || hdPath)
      return isLedger ? payload : { success: true, payload }
    }),
    deviceSignMessage: sinon.stub().callsFake(async ({ hdPath, message }) => ledgerSignature(signMessage(hdPath, `0x${message}`))),
    deviceSignTypedData: sinon.stub().callsFake(async ({ hdPath, message }) => ledgerSignature(signMessage(hdPath, message, true))),
    ethereumSignMessage: sinon.stub().callsFake(async ({ path, message }) => ({
      success: true, payload: {
        address: toChecksumAddress(publicKey(path).address), signature: signMessage(path, `0x${message}`).slice(2),
      },
    })),
    ethereumSignTypedData: sinon.stub().callsFake(async ({ path, data }) => ({
      success: true, payload: {
        address: toChecksumAddress(publicKey(path).address), signature: signMessage(path, data, true),
      },
    })),
    deviceSignTransaction: sinon.stub().callsFake(async ({ hdPath, tx }) => signTransaction(hdPath, tx)),
    ethereumSignTransaction: sinon.stub().callsFake(async ({ path, transaction }) => ({
      success: true, payload: signTransaction(path, transaction),
    })),
  }
  const Keyring = isLedger ? LedgerKeyring : TrezorKeyring
  const handler = createHardwareRequestHandler({ [kind]: () => new Keyring({ bridge }) })
  const Remote = createRemoteKeyring(Keyring.type, (request) => handler(JSON.parse(JSON.stringify(request))))
  return { keyring: new Remote(opts), bridge, handler }
}

describe('Current hardware keyring compatibility', function () {
  for (const kind of ['trezor', 'ledger']) {
    describe(kind, function () {
      const hdPath = kind === 'ledger' ? ledgerPath : trezorPath

      it('pages accounts, retains multiple imported accounts, and restores their public state', async function () {
        const { keyring, bridge } = setupHardware(kind, { hdPath })
        const firstPage = await keyring.getFirstPage()
        const secondPage = await keyring.getNextPage()
        assert.equal(firstPage[0].index, 0)
        assert.equal(secondPage[0].index, 5)
        keyring.setAccountToUnlock(0)
        await keyring.addAccounts(1)
        keyring.setAccountToUnlock(6)
        await keyring.addAccounts(1)
        const accounts = await keyring.getAccounts()
        assert.equal(accounts.length, 2)
        assert.equal(accounts[0].toLowerCase(), publicKey(`${hdPath}/0`).address)
        assert.equal(accounts[1].toLowerCase(), publicKey(`${hdPath}/6`).address)
        const restored = setupHardware(kind, await keyring.serialize())
        assert.deepEqual(await restored.keyring.getAccounts(), accounts)
        assert.equal(restored.bridge.init.callCount, 0)
        assert.equal(bridge.init.callCount, 1)
      })

      it('signs a legacy transaction on a custom chain through the real keyring', async function () {
        const { keyring } = setupHardware(kind, { hdPath })
        await keyring.getFirstPage()
        keyring.setAccountToUnlock(2)
        const [account] = await keyring.addAccounts(1)
        const tx = new Transaction({
          nonce: '0x01', gasPrice: '0x04a817c800', gasLimit: '0x5208',
          to: `0x${'2'.repeat(40)}`, value: '0x01', chainId: 1337,
        })
        const signed = await keyring.signTransaction(account, tx)
        assert.equal(signed.getChainId(), 1337)
        assert.equal(signed.verifySignature(), true)
        assert.equal(`0x${signed.getSenderAddress().toString('hex')}`, account.toLowerCase())
        assert.deepEqual(signed.raw.slice(0, 6), tx.raw.slice(0, 6))
      })

      for (const type of kind === 'ledger' ? ['0x1', '0x2'] : ['0x2']) {
        it(`signs ${type} with access lists through the real hardware keyring`, async function () {
          const { keyring } = setupHardware(kind, { hdPath })
          await keyring.getFirstPage()
          keyring.setAccountToUnlock(0)
          const [account] = await keyring.addAccounts(1)
          const accessList = [{ address: `0x${'2'.repeat(40)}`, storageKeys: [`0x${'3'.repeat(64)}`] }]
          const tx = createTransaction({
            type, nonce: '0x1', gas: '0x186a0', to: account, value: '0x0', accessList,
            ...(type === '0x1' ? { gasPrice: '0x64' } : { maxFeePerGas: '0xc8', maxPriorityFeePerGas: '0x2' }),
          }, 1337)
          const signed = await keyring.signTransaction(account, tx)
          assert.equal(signed.verifySignature(), true)
          assert.equal(signed.getSenderAddress().toString(), account.toLowerCase())
          assert.deepEqual(signed.toJSON().accessList, accessList)
          assert.equal(signed.common.chainId().toString(), '1337')
          assert.equal(tx.isSigned(), false, 'immutable signing returns a new transaction')
        })
      }

      it('signs personal messages and EIP-712 V4 data across transport restarts', async function () {
        const { keyring } = setupHardware(kind, { hdPath })
        await keyring.getFirstPage()
        keyring.setAccountToUnlock(1)
        const [address] = await keyring.addAccounts(1)
        const message = '0x68656c6c6f'
        const personal = await keyring.signPersonalMessage(address, message)
        assert.equal(sigUtil.recoverPersonalSignature({ data: message, sig: personal }), address.toLowerCase())
        const data = {
          types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Greeting: [{ name: 'text', type: 'string' }] },
          primaryType: 'Greeting', domain: { chainId: 1337 }, message: { text: 'hello' },
        }
        // Closing hardware.html discards its SDK instances. The next signing
        // operation must work with only the returned, serialized public state.
        const restored = setupHardware(kind, await keyring.serialize())
        const typed = await restored.keyring.signTypedData(address, data, { version: 'V4' })
        assert.equal(sigUtil.recoverTypedSignature_v4({ data, sig: typed }), address.toLowerCase())
      })

      it('replaces a previous transport session after background restoration', async function () {
        const { keyring, bridge, handler } = setupHardware(kind, { hdPath })
        await keyring.getFirstPage()
        keyring.setAccountToUnlock(1)
        await keyring.addAccounts(1)
        const Restored = createRemoteKeyring(keyring.type, handler)
        const restored = new Restored(await keyring.serialize())
        await restored.getFirstPage()
        assert.equal(bridge.init.callCount, 2)
        assert.equal((kind === 'ledger' ? bridge.destroy : bridge.dispose).callCount, 1)
        assert.deepEqual(await restored.getAccounts(), await keyring.getAccounts())
      })

      it('forgets the device and destroys its transport', async function () {
        const { keyring, bridge } = setupHardware(kind, { hdPath })
        await keyring.getFirstPage()
        await keyring.forgetDevice()
        assert.deepEqual(await keyring.getAccounts(), [])
        assert.equal(keyring.isUnlocked(), false)
        assert.equal((kind === 'ledger' ? bridge.destroy : bridge.dispose).callCount, 1)
      })
    })
  }

  it('migrates old Ledger Live accountIndexes without losing the account path', async function () {
    const address = toChecksumAddress(publicKey("m/44'/60'/7'/0/0").address)
    const { keyring } = setupHardware('ledger', {
      hdPath: "m/44'/60'/0'/0/0", accounts: [address], accountIndexes: { [address]: 7 },
    })
    assert.deepEqual(await keyring.getAccounts(), [address])
    await keyring.getFirstPage()
    assert.deepEqual((await keyring.serialize()).accountDetails[address], {
      bip44: true, hdPath: "m/44'/60'/7'/0/0",
    })
  })

  it('defers old Ledger legacy-path migration until device use, preserving a changed discovery path', async function () {
    const address = toChecksumAddress(publicKey(`${ledgerPath}/3`).address)
    const { keyring, bridge } = setupHardware('ledger', { hdPath: ledgerPath, accounts: [address] })
    assert.deepEqual(await keyring.getAccounts(), [address])
    assert.equal(bridge.getPublicKey.callCount, 0)
    keyring.setHdPath("m/44'/60'/0'/0/0")
    await keyring.getFirstPage()
    assert.deepEqual((await keyring.serialize()).accountDetails[address], {
      bip44: false, hdPath: `${ledgerPath}/3`,
    })
    assert.deepEqual(await keyring.getAccounts(), [address])
  })

  it('preserves Ledger Live paths when discovery switches to the legacy path', async function () {
    const address = toChecksumAddress(publicKey("m/44'/60'/7'/0/0").address)
    const { keyring } = setupHardware('ledger', {
      hdPath: "m/44'/60'/0'/0/0", accounts: [address], accountIndexes: { [address]: 7 },
    })
    keyring.setHdPath(ledgerPath)
    await keyring.getFirstPage()
    assert.equal((await keyring.serialize()).accountDetails[address].hdPath, "m/44'/60'/7'/0/0")
    assert.deepEqual(await keyring.getAccounts(), [address])
  })

  it('retains public accounts when a legacy Ledger vault lacks migration information', async function () {
    const address = toChecksumAddress(publicKey("m/44'/60'/7'/0/0").address)
    const { keyring } = setupHardware('ledger', { hdPath: "m/44'/60'/0'/0/0", accounts: [address] })
    await assert.rejects(keyring.getFirstPage(), /Unable to restore hardware account paths/u)
    assert.deepEqual(await keyring.getAccounts(), [address])
  })

  it('rejects unsupported operations before creating a device connection', async function () {
    const { handler, bridge } = setupHardware('trezor')
    await assert.rejects(handler({
      id: 'test', keyringType: 'Trezor Hardware', method: 'deserialize', args: [], state: { accounts: [] },
    }), /Invalid hardware wallet request/u)
    assert.equal(bridge.init.callCount, 0)
  })

  it('propagates device rejection without replaying the signing request', async function () {
    const { keyring, bridge } = setupHardware('ledger', { hdPath: ledgerPath })
    await keyring.getFirstPage()
    keyring.setAccountToUnlock(0)
    const [address] = await keyring.addAccounts(1)
    bridge.deviceSignTransaction.rejects(new Error('User rejected'))
    const tx = new Transaction({ chainId: 1, gasLimit: '0x5208' })
    await assert.rejects(keyring.signTransaction(address, tx))
    assert.equal(bridge.deviceSignTransaction.callCount, 1)
    assert.deepEqual(await keyring.getAccounts(), [address])
    await keyring.getFirstPage()
  })
})
