import assert from 'assert'
import { JsonRpcEngine } from '@metamask/json-rpc-engine'
import { providerAsMiddleware } from '@metamask/eth-json-rpc-middleware'
import { providerErrors } from '@metamask/rpc-errors'
import providerFromEngine from '../../../../../app/scripts/controllers/network/provider-from-engine'

describe('providerFromEngine', function () {
  function createProvider (middleware) {
    const engine = new JsonRpcEngine()
    engine.push(middleware)
    return providerFromEngine(engine)
  }

  it('passes extra request fields, such as origin, to the engine', async function () {
    const provider = createProvider((req, res, _next, end) => {
      res.result = req.origin
      end()
    })
    assert.equal(await provider.request({ method: 'eth_chainId', origin: 'https://example.com' }), 'https://example.com')
  })

  it('keeps an error\'s code and message when it reaches a page as JSON', async function () {
    // A site's requests reach the network provider through an outer engine,
    // whose response the browser sends to the page as JSON.
    const provider = createProvider((_req, _res, _next, end) => {
      end(providerErrors.userRejectedRequest('User denied transaction signature.'))
    })
    const outer = new JsonRpcEngine()
    outer.push(providerAsMiddleware(provider))
    const res = await outer.handle({ id: 1, jsonrpc: '2.0', method: 'eth_sendTransaction', params: [] })
    const { error } = JSON.parse(JSON.stringify(res))
    assert.equal(error.code, 4001)
    assert.equal(error.message, 'User denied transaction signature.')
  })

  it('reports an error without a usable code or message as an internal error', async function () {
    const provider = createProvider((_req, res, _next, end) => {
      res.error = { code: 'bad', message: '' }
      end()
    })
    await assert.rejects(provider.request({ method: 'eth_call' }), (error) => {
      assert.equal(error.code, -32603)
      assert.equal(error.message, 'Internal JSON-RPC error.')
      return true
    })
  })
})
