import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import {
  createBlockCacheMiddleware,
  createBlockRefMiddleware,
  createBlockTrackerInspectorMiddleware,
  createFetchMiddleware,
  createInflightCacheMiddleware,
  createRetryOnEmptyMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import { providerFromMiddlewareV2 } from '@metamask/eth-json-rpc-provider';
import {
  asLegacyMiddleware,
  createScaffoldMiddleware,
} from '@metamask/json-rpc-engine/v2';

import { BUILT_IN_NETWORKS } from './enums';
import createRpcService from './rpc-service';

/**
 * Creates a client for a built-in network. Its chain and network IDs are
 * answered locally so a misbehaving public RPC cannot change which chain
 * transactions are signed for.
 *
 * @param {object} options0 - Client options.
 * @param {string} options0.network - The built-in network type.
 * @returns {{ networkMiddleware: Function, blockTracker: object }} The
 * network middleware and its block tracker.
 */
export default function createBuiltInClient({ network }) {
  const config = BUILT_IN_NETWORKS[network];
  if (!config) {
    throw new Error(`createBuiltInClient - unknown network "${network}"`);
  }
  const rpcUrls = [config.rpcUrl, ...(config.fallbackRpcUrls || [])];
  const fetchMiddleware = createFetchMiddleware({
    rpcService: createRpcService({ rpcUrls }),
  });
  const fetchProvider = providerFromMiddlewareV2(fetchMiddleware);
  const blockTracker = new PollingBlockTracker({ provider: fetchProvider });

  // One engine for the whole chain, so the caches see the fetched results.
  const networkMiddleware = asLegacyMiddleware(
    createScaffoldMiddleware({
      eth_chainId: config.chainId,
      net_version: config.networkId,
    }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockRefMiddleware({ blockTracker, provider: fetchProvider }),
    createRetryOnEmptyMiddleware({ blockTracker, provider: fetchProvider }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  );
  return { networkMiddleware, blockTracker };
}
