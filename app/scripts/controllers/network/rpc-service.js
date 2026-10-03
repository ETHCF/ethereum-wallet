import { rpcErrors } from '@metamask/rpc-errors'

const MAX_ATTEMPTS = 5
const RETRY_INTERVAL_MS = 1000

// Transient failures worth retrying: overloaded servers, HTML error pages or
// truncated bodies, and connections that never opened.
const RETRIABLE_ERRORS = [
  'Gateway timeout',
  'ETIMEDOUT',
  'failed to parse response body',
  'Failed to fetch',
]

/**
 * Sends JSON-RPC requests to one RPC endpoint, for createFetchMiddleware from
 * @metamask/eth-json-rpc-middleware. It keeps the retry and error handling of
 * the fetch middleware in eth-json-rpc-middleware 5.
 *
 * @param {Object} options
 * @param {string} options.rpcUrl - The endpoint. Credentials in the URL are
 * sent as a Basic Authorization header.
 * @param {Function} [options.fetch] - The fetch implementation
 * @returns {{ request: Function }} The RPC service
 */
export default function createRpcService ({ rpcUrl, fetch = (...args) => globalThis.fetch(...args) }) {
  const url = new URL(rpcUrl)
  const authorization = url.username || url.password
    ? `Basic ${globalThis.btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)}`
    : undefined
  url.username = ''
  url.password = ''
  const endpoint = url.toString()

  async function send (jsonRpcRequest, headers) {
    const { id, jsonrpc, method, params } = jsonRpcRequest
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
        ...headers,
      },
      body: JSON.stringify({ id, jsonrpc, method, params }),
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

  return {
    async request (jsonRpcRequest, { headers } = {}) {
      let lastError
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          return await send(jsonRpcRequest, headers)
        } catch (error) {
          if (!RETRIABLE_ERRORS.some((phrase) => String(error).includes(phrase))) {
            throw error
          }
          lastError = error
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS))
      }
      throw lastError
    },
  }
}
