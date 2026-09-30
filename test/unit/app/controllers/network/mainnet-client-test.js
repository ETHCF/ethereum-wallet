import { strict as assert } from 'assert'
import nock from 'nock'
import JsonRpcEngine from 'json-rpc-engine'
import createInfuraClient from '../../../../../app/scripts/controllers/network/createInfuraClient'

describe('Built-in mainnet RPC', function () {
  it('retrieves blocks using JSON-RPC POST and preserves Ethereum network identifiers', async function () {
    const endpoint = nock('https://ethereum-rpc.publicnode.com')
      .persist()
      .post('/', (body) => body.method === 'eth_blockNumber' && body.jsonrpc === '2.0')
      .reply(200, { id: 1, jsonrpc: '2.0', result: '0x1234' })
    const { networkMiddleware, blockTracker } = createInfuraClient({ network: 'mainnet' })
    const engine = new JsonRpcEngine()
    engine.push(networkMiddleware)
    try {
      const block = await engine.handle({ id: 1, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] })
      assert.equal(block.error, undefined)
      assert.equal(block.result, '0x1234')
      assert.ok(endpoint.isDone())
      const chain = await engine.handle({ id: 2, jsonrpc: '2.0', method: 'eth_chainId', params: [] })
      const network = await engine.handle({ id: 3, jsonrpc: '2.0', method: 'net_version', params: [] })
      assert.equal(Number(chain.result), 1)
      assert.equal(network.result, '1')
    } finally {
      blockTracker.removeAllListeners()
      nock.cleanAll()
    }
  })
})
