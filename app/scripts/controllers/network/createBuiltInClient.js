import mergeMiddleware from 'json-rpc-engine/src/mergeMiddleware'
import createScaffoldMiddleware from 'json-rpc-engine/src/createScaffoldMiddleware'
import createBlockReRefMiddleware from 'eth-json-rpc-middleware/block-ref'
import createRetryOnEmptyMiddleware from 'eth-json-rpc-middleware/retryOnEmpty'
import createBlockCacheMiddleware from 'eth-json-rpc-middleware/block-cache'
import createInflightMiddleware from 'eth-json-rpc-middleware/inflight-cache'
import createBlockTrackerInspectorMiddleware from 'eth-json-rpc-middleware/block-tracker-inspector'
import providerFromMiddleware from 'eth-json-rpc-middleware/providerFromMiddleware'
import createFetchMiddleware from 'eth-json-rpc-middleware/fetch'
import BlockTracker from 'eth-block-tracker'
import { BUILT_IN_NETWORKS } from './enums'

/**
 * Creates a client for a built-in network. Its chain and network IDs are
 * answered locally so a misbehaving public RPC cannot change which chain
 * transactions are signed for.
 */
export default function createBuiltInClient ({ network }) {
  const config = BUILT_IN_NETWORKS[network]
  if (!config) {
    throw new Error(`createBuiltInClient - unknown network "${network}"`)
  }
  const fetchMiddleware = createFetchMiddleware({ rpcUrl: config.rpcUrl })
  const fetchProvider = providerFromMiddleware(fetchMiddleware)
  const blockTracker = new BlockTracker({ provider: fetchProvider })

  const networkMiddleware = mergeMiddleware([
    createScaffoldMiddleware({
      eth_chainId: config.chainId,
      net_version: config.networkId,
    }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightMiddleware(),
    createBlockReRefMiddleware({ blockTracker, provider: fetchProvider }),
    createRetryOnEmptyMiddleware({ blockTracker, provider: fetchProvider }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  ])
  return { networkMiddleware, blockTracker }
}
