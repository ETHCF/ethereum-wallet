import {
  createBlockCacheMiddleware,
  createBlockRefMiddleware,
  createBlockTrackerInspectorMiddleware,
  createInflightCacheMiddleware,
  createRetryOnEmptyMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import {
  asLegacyMiddleware,
  createScaffoldMiddleware,
} from '@metamask/json-rpc-engine/v2';

import createFetchClient from './createFetchClient';
import { BUILT_IN_NETWORKS } from './enums';

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
  const { fetchMiddleware, provider, blockTracker } =
    createFetchClient(rpcUrls);

  // One engine for the whole chain, so the caches see the fetched results.
  const networkMiddleware = asLegacyMiddleware(
    createScaffoldMiddleware({
      eth_chainId: config.chainId,
      net_version: config.networkId,
    }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockRefMiddleware({ blockTracker, provider }),
    createRetryOnEmptyMiddleware({ blockTracker, provider }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  );
  return { networkMiddleware, blockTracker };
}
