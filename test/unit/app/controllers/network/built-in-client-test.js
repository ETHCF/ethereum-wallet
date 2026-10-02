import { strict as assert } from 'assert'
import nock from 'nock'
import { JsonRpcEngine } from '@metamask/json-rpc-engine'
import createBuiltInClient from '../../../../../app/scripts/controllers/network/createBuiltInClient'
import { BUILT_IN_NETWORKS } from '../../../../../app/scripts/controllers/network/enums'

describe('Built-in network RPC', function () {
  afterEach(function () {
    nock.cleanAll()
  })

  for (const [type, { rpcUrl, chainId, networkId }] of Object.entries(BUILT_IN_NETWORKS)) {
    it(`retrieves blocks from ${type} over JSON-RPC POST and answers its own identifiers`, async function () {
      const { origin, pathname } = new URL(rpcUrl)
      const endpoint = nock(origin)
        .persist()
        .post(pathname, (body) => body.method === 'eth_blockNumber' && body.jsonrpc === '2.0')
        .reply(200, { id: 1, jsonrpc: '2.0', result: '0x1234' })
      const { networkMiddleware, blockTracker } = createBuiltInClient({ network: type })
      const engine = new JsonRpcEngine()
      engine.push(networkMiddleware)
      try {
        const block = await engine.handle({ id: 1, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] })
        assert.equal(block.error, undefined)
        assert.equal(block.result, '0x1234')
        assert.ok(endpoint.isDone())
        // Answered locally, so the RPC never decides which chain is signed for.
        const chain = await engine.handle({ id: 2, jsonrpc: '2.0', method: 'eth_chainId', params: [] })
        const network = await engine.handle({ id: 3, jsonrpc: '2.0', method: 'net_version', params: [] })
        assert.equal(chain.result, chainId)
        assert.equal(network.result, networkId)
      } finally {
        blockTracker.removeAllListeners()
      }
    })
  }

  it('rejects unknown and shut-down networks', function () {
    for (const network of ['ropsten', 'rinkeby', 'kovan', 'goerli', 'nope']) {
      assert.throws(() => createBuiltInClient({ network }), /unknown network/u)
    }
  })
})
