import { asLegacyMiddleware } from '@metamask/json-rpc-engine/v2'
import {
  createBlockCacheMiddleware,
  createBlockRefRewriteMiddleware,
  createBlockTrackerInspectorMiddleware,
  createFetchMiddleware,
  createInflightCacheMiddleware,
} from '@metamask/eth-json-rpc-middleware'
import { providerFromMiddlewareV2 } from '@metamask/eth-json-rpc-provider'
import { PollingBlockTracker } from '@metamask/eth-block-tracker'
import createRpcService from './rpc-service'

export default function createJsonRpcClient ({ rpcUrl }) {
  const fetchMiddleware = createFetchMiddleware({ rpcService: createRpcService({ rpcUrls: [rpcUrl] }) })
  const blockProvider = providerFromMiddlewareV2(fetchMiddleware)
  const blockTracker = new PollingBlockTracker({ provider: blockProvider })

  // One engine for the whole chain, so the caches see the fetched results.
  const networkMiddleware = asLegacyMiddleware(
    createBlockRefRewriteMiddleware({ blockTracker }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  )
  return { networkMiddleware, blockTracker }
}
