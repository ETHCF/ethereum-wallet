import { rpcErrors } from '@metamask/rpc-errors'

const MAX_ATTEMPTS = 5
const RETRY_INTERVAL_MS = 1000
const TIMEOUT_MS = 10000

// Transient failures worth retrying: overloaded servers, HTML error pages or
// truncated bodies, and connections that never opened.
const RETRIABLE_ERRORS = [
  'Gateway timeout',
  'ETIMEDOUT',
  'failed to parse response body',
  'Failed to fetch',
]

function isRetriable (error) {
  // A request we gave up on. The host took the connection and never answered,
  // which is the one failure that looks like success to fetch, so without this
  // a hung endpoint would stop the walk instead of handing on to the next one.
  if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return true
  }
  return RETRIABLE_ERRORS.some((phrase) => String(error).includes(phrase))
}

/**
 * Splits credentials out of an endpoint URL, so they travel as a header.
 *
 * @param {string} rpcUrl - The endpoint, which may carry credentials.
 * @returns {{ endpoint: string, authorization: string|undefined }} The target.
 */
function prepareTarget (rpcUrl) {
  const url = new URL(rpcUrl)
  const authorization = url.username || url.password
    ? `Basic ${globalThis.btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)}`
    : undefined
  url.username = ''
  url.password = ''
  return { endpoint: url.toString(), authorization }
}

/**
 * Sends JSON-RPC requests to a chain's endpoints, for createFetchMiddleware
 * from @metamask/eth-json-rpc-middleware. It keeps the retry and error
 * handling of the fetch middleware in eth-json-rpc-middleware 5, and moves to
 * the next endpoint when one cannot be reached, so a single unreachable host
 * does not take the wallet offline.
 *
 * @param {Object} options
 * @param {string[]} options.rpcUrls - The endpoints, tried in order.
 * Credentials in a URL are sent as a Basic Authorization header.
 * @param {Function} [options.fetch] - The fetch implementation
 * @param {number} [options.retryIntervalMs] - Wait between retry rounds
 * @param {number} [options.timeoutMs] - How long one endpoint gets to answer
 * @returns {{ request: Function }} The RPC service
 */
export default function createRpcService ({
  rpcUrls,
  fetch = (...args) => globalThis.fetch(...args),
  retryIntervalMs = RETRY_INTERVAL_MS,
  timeoutMs = TIMEOUT_MS,
}) {
  if (!Array.isArray(rpcUrls) || rpcUrls.length === 0) {
    throw new Error('createRpcService - rpcUrls must be a non-empty array')
  }
  const targets = rpcUrls.map(prepareTarget)

  async function send (target, jsonRpcRequest, headers) {
    const { id, jsonrpc, method, params } = jsonRpcRequest
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(target.authorization ? { Authorization: target.authorization } : {}),
        ...headers,
      },
      body: JSON.stringify({ id, jsonrpc, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    switch (response.status) {
      case 405:
        throw rpcErrors.methodNotFound()
      case 418:
        throw rpcErrors.internal({ message: 'Request is being rate limited.' })
      case 503:
      case 504:
        throw rpcErrors.internal({
          message: 'Gateway timeout. The request took too long to process. This can happen when querying logs over too wide a block range.',
        })
      default:
    }
    const rawBody = await response.text()
    let body
    try {
      body = JSON.parse(rawBody)
    } catch (_) {
      throw new Error(`FetchMiddleware - failed to parse response body: "${rawBody}"`)
    }
    if (response.status !== 200) {
      throw rpcErrors.internal({ message: `Non-200 status code: '${response.status}'`, data: body })
    }
    // The fetch middleware turns a JSON-RPC error in the body into an error.
    return body
  }

  // The endpoint that answered last. Without this every request would start at
  // an endpoint already known to be unreachable and wait out its timeout again,
  // which is the difference between one slow request and every request being
  // slow for as long as the outage lasts. The endpoints serve the same chain,
  // so there is nothing to go back to the first one for.
  let preferred = 0

  return {
    async request (jsonRpcRequest, { headers } = {}) {
      let lastError
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        for (let i = 0; i < targets.length; i++) {
          const index = (preferred + i) % targets.length
          try {
            const body = await send(targets[index], jsonRpcRequest, headers)
            preferred = index
            return body
          } catch (error) {
            // Anything the endpoint answered, such as a bad method, is the
            // same from every endpoint, so only reachability is retried.
            if (!isRetriable(error)) {
              throw error
            }
            lastError = error
          }
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryIntervalMs))
        }
      }
      throw lastError
    },
  }
}
