import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import ObservableStore from 'obs-store'
import { privateToAddress } from 'ethereumjs-util'
import { createTransaction, decodeTransaction } from '../../../app/scripts/lib/transaction-codec'
import { gasPriceForTransaction, replacementFees } from '../../../app/scripts/lib/transaction-fees'
import { normalizeTxParams, validateTxParams } from '../../../app/scripts/controllers/transactions/lib/util'
import TransactionController from '../../../app/scripts/controllers/transactions'
import { createTestProviderTools } from '../../stub/provider'

const key = Buffer.alloc(32, 1)
const from = `0x${privateToAddress(key).toString('hex')}`
const to = `0x${'2'.repeat(40)}`
const accessList = [{ address: to, storageKeys: [`0x${'3'.repeat(64)}`] }]
const base = { from, to, nonce: '0x7', gas: '0x186a0', value: '0x1', chainId: '0x539' }
const authorizationList = [{ address: to, chainId: '0x539', nonce: '0x1', yParity: '0x0', r: '0x1', s: '0x1' }]

function controller () {
  const scaffold = {
    eth_getBlockByNumber: { gasLimit: '0x1c9c380', baseFeePerGas: '0x64', requestsHash: `0x${'0'.repeat(64)}` },
    eth_gasPrice: '0x78', eth_maxPriorityFeePerGas: '0x2', eth_estimateGas: '0x7530', eth_getCode: '0x',
  }
  const { provider } = createTestProviderTools({ scaffold })
  const blockTracker = new EventEmitter()
  blockTracker.getCurrentBlock = () => null
  blockTracker.getLatestBlock = () => null
  const tx = new TransactionController({
    provider, blockTracker, networkStore: new ObservableStore('1337'),
    preferencesStore: new ObservableStore({ selectedAddress: from }),
    getPermittedAccounts: async () => [from], signTransaction: async (unsigned) => unsigned.sign(key),
  })
  return { tx, scaffold }
}

describe('Modern transaction pipeline', function () {
  for (const type of ['0x1', '0x2', '0x4']) {
    it(`signs and decodes type ${type} without losing envelope fields`, async function () {
      const { tx } = controller()
      const params = {
        ...base, type, accessList,
        ...(type === '0x1' ? { gasPrice: '0x64' } : { maxFeePerGas: '0xc8', maxPriorityFeePerGas: '0x2' }),
        ...(type === '0x4' ? { authorizationList } : {}),
      }
      const meta = await tx.addUnapprovedTransaction(params, 'ecf-wallet')
      const raw = await tx.signTransaction(meta.id)
      assert.equal(raw.slice(0, 4), `0x0${Number(type)}`)
      const signed = decodeTransaction(raw, 1337)
      assert.equal(signed.verifySignature(), true)
      assert.equal(signed.getSenderAddress().toString(), from)
      assert.equal(signed.toJSON().nonce, '0x7')
      assert.deepEqual(signed.toJSON().accessList, accessList)
      if (type !== '0x1') {
        assert.equal(signed.toJSON().maxFeePerGas, '0xc8')
        assert.equal(signed.toJSON().maxPriorityFeePerGas, '0x2')
      }
      if (type === '0x4') {
        assert.equal(signed.toJSON().authorizationList[0].nonce, '0x01', 'final EIP-7702 uses a scalar nonce')
      }
    })
  }

  it('defaults to EIP-1559 on London networks and preserves explicit legacy requests', async function () {
    const { tx } = controller()
    const meta = await tx.addUnapprovedTransaction({ ...base, gasPrice: '0x78' }, 'ecf-wallet')
    assert.equal(meta.txParams.type, '0x2')
    assert.equal(meta.txParams.maxFeePerGas, '0xca')
    assert.equal(meta.txParams.gasPrice, undefined)
    const legacy = await tx.addUnapprovedTransaction({ ...base, type: '0x0', gasPrice: '0x78' }, 'ecf-wallet')
    assert.equal(legacy.txParams.gasPrice, '0x78')
    assert.equal(legacy.txParams.maxFeePerGas, undefined)
  })

  it('falls back on pre-London networks and rejects explicitly requested fee-market transactions', async function () {
    const { tx, scaffold } = controller()
    delete scaffold.eth_getBlockByNumber.baseFeePerGas
    const meta = await tx.addUnapprovedTransaction(base, 'ecf-wallet')
    assert.equal(meta.txParams.gasPrice, '0x78')
    await assert.rejects(tx.addUnapprovedTransaction({ ...base, type: '0x2' }, 'ecf-wallet'), /does not support EIP-1559/u)
  })

  it('rejects blobs, mismatched chains, external authorizations, and invalid fee combinations', async function () {
    const { tx } = controller()
    for (const extra of [
      { type: '0x3' }, { blobs: [] }, { type: '0x7' }, { chainId: '0x1' },
      { type: '0x2', gasPrice: '0x1' }, { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x2' },
      { type: '0x4', authorizationList }, { authorizationList },
    ]) {
      await assert.rejects(tx.addUnapprovedTransaction({ ...base, ...extra }, 'https://example.com'))
    }
    assert.throws(() => validateTxParams(normalizeTxParams({ ...base, accessList: [{ address: to, storageKeys: ['0x1'] }] })))
  })

  it('binds approval to the chain even when two RPCs share a network/history ID', async function () {
    const { tx } = controller()
    tx.getSigningChainId = () => '0x539'
    const params = { ...base, type: '0x2' }
    delete params.chainId
    const meta = await tx.addUnapprovedTransaction(params, 'ecf-wallet')
    tx.getSigningChainId = () => '0x1'
    await assert.rejects(tx.signTransaction(meta.id), /chainId/u)
  })

  it('rejects a signer that changes the approved payload', async function () {
    const { tx } = controller()
    const meta = await tx.addUnapprovedTransaction({ ...base, type: '0x2' }, 'ecf-wallet')
    tx.signEthTx = async () => createTransaction({ ...meta.txParams, value: '0x2' }, 1337).sign(key)
    await assert.rejects(tx.signTransaction(meta.id), /does not match/u)
  })

  const networkSwitchScenarios = ['shared history ID', 'different network', 'switch away and back']
  networkSwitchScenarios.forEach((scenario) => {
    it(`does not broadcast after a network switch during signing: ${scenario}`, async function () {
      const { tx } = controller()
      let chainId = '0x539'
      tx.getSigningChainId = () => chainId
      const meta = await tx.addUnapprovedTransaction({ ...base, type: '0x2' }, 'ecf-wallet')
      let release, started
      const ready = new Promise((resolve) => {
        started = resolve
      })
      const finish = new Promise((resolve) => {
        release = resolve
      })
      tx.signEthTx = async (unsigned) => {
        started()
        await finish
        return unsigned.sign(key)
      }
      let lockReleased = false
      tx.nonceTracker.getNonceLock = async () => ({
        nextNonce: 7, nonceDetails: {}, releaseLock: () => {
          lockReleased = true
        },
      })
      let broadcasts = 0
      tx.query = {
        sendRawTransaction: async () => {
          broadcasts += 1
        },
      }
      const result = new Promise((resolve) => tx.txStateManager.once(`${meta.id}:finished`, resolve))
      const failed = assert.rejects(tx.approveTransaction(meta.id), /Network changed/u)
      await ready
      chainId = '0x1'
      if (scenario !== 'shared history ID') {
        tx.networkStore.putState('1')
      }
      if (scenario === 'switch away and back') {
        chainId = '0x539'
        tx.networkStore.putState('1337')
      }
      release()
      await failed
      assert.equal(broadcasts, 0)
      assert.equal(lockReleased, true)
      assert.equal((await result).status, 'failed')
      assert.equal(tx.txStateManager.getFullTxList().find(({ id }) => id === meta.id).status, 'failed')
    })
  })

  it('checks the chain again if it changes between signing and publishing', async function () {
    const { tx } = controller()
    tx.getSigningChainId = () => '0x539'
    const meta = await tx.addUnapprovedTransaction({ ...base, type: '0x2' }, 'ecf-wallet')
    const raw = await tx.signTransaction(meta.id)
    let broadcasts = 0
    tx.query = {
      sendRawTransaction: async () => {
        broadcasts += 1
      },
    }
    tx.getSigningChainId = () => '0x1'
    await assert.rejects(tx.publishTransaction(meta.id, raw), /Network changed before publishing/u)
    assert.equal(broadcasts, 0)
  })

  it('estimates access-list intrinsic costs instead of using the simple-send shortcut', async function () {
    const { tx } = controller()
    const params = { ...base, type: '0x2', accessList }
    delete params.gas
    const meta = await tx.addUnapprovedTransaction(params, 'ecf-wallet')
    assert.equal(meta.txParams.gas, '0xafc8')
  })

  it('bumps both fee caps and preserves the original nonce for speed-up and cancellation', async function () {
    const { tx } = controller()
    const meta = await tx.addUnapprovedTransaction({ ...base, type: '0x2', accessList }, 'ecf-wallet')
    tx.nonceTracker.getNonceLock = async () => ({ nextNonce: 99, releaseLock: () => undefined })
    tx.publishTransaction = async (id) => tx.txStateManager.setTxStatusSubmitted(id)
    const replacement = await tx.createSpeedUpTransaction(meta.id)
    const cancelled = await tx.createCancelTransaction(replacement.id)
    for (const candidate of [replacement, cancelled]) {
      const saved = tx.txStateManager.getTx(candidate.id)
      assert.equal(saved.txParams.nonce, '0x7')
      assert.equal(saved.txParams.gasPrice, undefined)
      assert.equal(saved.txParams.type, '0x2')
    }
    assert.deepEqual(replacement.txParams.accessList, accessList)
    assert.equal(cancelled.txParams.to, from)
    assert.equal(cancelled.txParams.accessList, undefined)
    assert.equal(cancelled.txParams.authorizationList, undefined)
    assert.deepEqual(replacementFees({ maxFeePerGas: '0xa', maxPriorityFeePerGas: '0x0' }), { maxFeePerGas: '0xb', maxPriorityFeePerGas: '0x1' })
    assert.equal(gasPriceForTransaction(meta.txParams, { effectiveGasPrice: '0x66' }), '0x66')
  })
})
