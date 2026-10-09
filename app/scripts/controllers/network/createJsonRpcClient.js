import {
  createBlockCacheMiddleware,
  createBlockRefRewriteMiddleware,
  createBlockTrackerInspectorMiddleware,
  createInflightCacheMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import { asLegacyMiddleware } from '@metamask/json-rpc-engine/v2';

import createFetchClient from './createFetchClient';

export default function createJsonRpcClient({ rpcUrl }) {
  const { fetchMiddleware, blockTracker } = createFetchClient([rpcUrl]);

  // One engine for the whole chain, so the caches see the fetched results.
  const networkMiddleware = asLegacyMiddleware(
    createBlockRefRewriteMiddleware({ blockTracker }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  );
  return { networkMiddleware, blockTracker };
}
