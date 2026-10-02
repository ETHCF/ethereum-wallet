import { asLegacyMiddleware } from '@metamask/json-rpc-engine/v2'
import {
  createBlockRefRewriteMiddleware,
  createBlockTrackerInspectorMiddleware,
  createFetchMiddleware,
} from '@metamask/eth-json-rpc-middleware'
import { providerFromMiddlewareV2 } from '@metamask/eth-json-rpc-provider'
import { PollingBlockTracker } from '@metamask/eth-block-tracker'
import createRpcService from './rpc-service'

const inTest = process.env.IN_TEST === 'true'

export default function createLocalhostClient () {
  const fetchMiddleware = createFetchMiddleware({ rpcService: createRpcService({ rpcUrl: 'http://localhost:8545/' }) })
  const blockProvider = providerFromMiddlewareV2(fetchMiddleware)
  const blockTracker = new PollingBlockTracker({ provider: blockProvider, pollingInterval: 1000 })

  const networkMiddleware = asLegacyMiddleware(
    createEstimateGasMiddleware(),
    createBlockRefRewriteMiddleware({ blockTracker }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  )
  return { networkMiddleware, blockTracker }
}

function delay (time) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

function createEstimateGasMiddleware () {
  return async ({ request, next }) => {
    if (request.method === 'eth_estimateGas' && inTest) {
      await delay(2000)
    }
    return next()
  }
}
