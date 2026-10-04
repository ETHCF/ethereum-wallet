import { strict as assert } from 'assert'
import migration3 from '../../../app/scripts/migrations/003'
import { REMOVED_NETWORK_TYPES } from '../../../app/scripts/controllers/network/enums'

describe('migration #3', function () {
  it('moves wallets on networks that are no longer built in to mainnet', async function () {
    for (const type of REMOVED_NETWORK_TYPES) {
      const { meta, data } = await migration3.migrate({
        meta: { version: 2 },
        data: { NetworkController: { provider: { type, rpcTarget: '', ticker: 'ETH', nickname: '' } }, Other: { a: 1 } },
      })
      assert.equal(meta.version, 3)
      assert.deepEqual(data.NetworkController.provider, { type: 'mainnet', rpcTarget: '', ticker: 'ETH', nickname: '' })
      assert.deepEqual(data.Other, { a: 1 })
    }
  })

  it('leaves the networks that are still built in alone', async function () {
    for (const type of ['mainnet', 'arbitrum', 'optimism', 'polygon', 'base', 'robinhood-chain', 'sepolia', 'localhost']) {
      const provider = { type, rpcTarget: '', ticker: 'ETH', nickname: '' }
      const { data } = await migration3.migrate({
        meta: { version: 2 },
        data: { NetworkController: { provider } },
      })
      assert.deepEqual(data.NetworkController.provider, provider)
    }
  })

  it('leaves a custom RPC and fresh state alone', async function () {
    const provider = { type: 'rpc', rpcTarget: 'https://rpc.test', chainId: '0x89', ticker: 'POL', nickname: 'Test' }
    assert.deepEqual((await migration3.migrate({ meta: { version: 2 }, data: { NetworkController: { provider } } })).data.NetworkController.provider, provider)
    assert.deepEqual((await migration3.migrate({ meta: { version: 2 }, data: {} })).data, {})
  })
})
