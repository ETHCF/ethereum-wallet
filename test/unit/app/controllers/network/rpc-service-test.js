import { strict as assert } from 'assert'
import createRpcService from '../../../../../app/scripts/controllers/network/rpc-service'

const REQUEST = { id: 1, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] }

/**
 * A fetch stub that answers each call from a queue of outcomes.
 *
 * @param {Array} outcomes - Either an Error to throw or a response spec.
 * @returns {Function} The stub, carrying the endpoints it was called with.
 */
function stubFetch (outcomes) {
  const calls = []
  const fetch = async (endpoint) => {
    calls.push(endpoint)
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]
    if (outcome instanceof Error) {
      throw outcome
    }
    return {
      status: outcome.status,
      text: async () => JSON.stringify(outcome.body),
    }
  }
  fetch.calls = calls
  return fetch
}

/**
 * A fetch stub whose hanging endpoints only settle when the signal aborts,
 * the way a real host that takes a connection and never answers behaves.
 *
 * @param {Array<'hang'|Object>} outcomes - Per call: hang, or a response spec.
 * @returns {Function} The stub, carrying the endpoints it was called with.
 */
function stubHangingFetch (outcomes) {
  const calls = []
  const fetch = (endpoint, options) => {
    calls.push(endpoint)
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]
    if (outcome !== 'hang') {
      return Promise.resolve({
        status: outcome.status,
        text: async () => JSON.stringify(outcome.body),
      })
    }
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason))
    })
  }
  fetch.calls = calls
  return fetch
}

const ok = { status: 200, body: { id: 1, jsonrpc: '2.0', result: '0x1234' } }

describe('createRpcService', function () {
  it('requires at least one endpoint', function () {
    assert.throws(() => createRpcService({ rpcUrls: [] }), /non-empty array/u)
    assert.throws(() => createRpcService({ rpcUrls: undefined }), /non-empty array/u)
  })

  it('uses the first endpoint when it answers', async function () {
    const fetch = stubFetch([ok])
    const service = createRpcService({
      rpcUrls: ['https://first.example/', 'https://second.example/'],
      fetch,
      retryIntervalMs: 0,
    })

    const body = await service.request(REQUEST)

    assert.equal(body.result, '0x1234')
    assert.deepEqual(fetch.calls, ['https://first.example/'])
  })

  it('moves to the next endpoint when the first cannot be reached', async function () {
    const fetch = stubFetch([new TypeError('Failed to fetch'), ok])
    const service = createRpcService({
      rpcUrls: ['https://first.example/', 'https://second.example/'],
      fetch,
      retryIntervalMs: 0,
    })

    const body = await service.request(REQUEST)

    assert.equal(body.result, '0x1234')
    assert.deepEqual(fetch.calls, ['https://first.example/', 'https://second.example/'])
  })

  it('throws the last error once every endpoint and attempt is exhausted', async function () {
    const fetch = stubFetch([new TypeError('Failed to fetch')])
    const service = createRpcService({
      rpcUrls: ['https://first.example/', 'https://second.example/'],
      fetch,
      retryIntervalMs: 0,
    })

    await assert.rejects(() => service.request(REQUEST), /Failed to fetch/u)
    // Five rounds across both endpoints.
    assert.equal(fetch.calls.length, 10)
  })

  it('gives up on an endpoint that never answers and uses the next one', async function () {
    const fetch = stubHangingFetch(['hang', ok])
    const service = createRpcService({
      rpcUrls: ['https://hung.example/', 'https://second.example/'],
      fetch,
      retryIntervalMs: 0,
      timeoutMs: 20,
    })

    const body = await service.request(REQUEST)

    assert.equal(body.result, '0x1234')
    assert.deepEqual(fetch.calls, ['https://hung.example/', 'https://second.example/'])
  })

  it('throws once every endpoint has timed out', async function () {
    const fetch = stubHangingFetch(['hang'])
    const service = createRpcService({
      rpcUrls: ['https://first.example/', 'https://second.example/'],
      fetch,
      retryIntervalMs: 0,
      timeoutMs: 20,
    })

    await assert.rejects(() => service.request(REQUEST), (error) => {
      assert.equal(error.name, 'TimeoutError')
      return true
    })
    assert.equal(fetch.calls.length, 10)
  })

  it('does not try another endpoint when the error is not about reachability', async function () {
    // 405 means the endpoint answered: every other endpoint would answer the same.
    const fetch = stubFetch([{ status: 405, body: {} }])
    const service = createRpcService({
      rpcUrls: ['https://first.example/', 'https://second.example/'],
      fetch,
      retryIntervalMs: 0,
    })

    await assert.rejects(() => service.request(REQUEST))
    assert.deepEqual(fetch.calls, ['https://first.example/'])
  })

  it('sends credentials in a header rather than the URL', async function () {
    const headers = []
    const fetch = async (endpoint, options) => {
      headers.push({ endpoint, authorization: options.headers.Authorization })
      return { status: 200, text: async () => JSON.stringify(ok.body) }
    }
    const service = createRpcService({ rpcUrls: ['https://user:pass@auth.example/'], fetch, retryIntervalMs: 0 })

    await service.request(REQUEST)

    assert.equal(headers[0].endpoint, 'https://auth.example/')
    assert.equal(headers[0].authorization, `Basic ${globalThis.btoa('user:pass')}`)
  })
})
