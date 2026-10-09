import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { createFetchMiddleware } from '@metamask/eth-json-rpc-middleware';
import { providerFromMiddlewareV2 } from '@metamask/eth-json-rpc-provider';

import createRpcService from './rpc-service';

/**
 * Creates the fetch middleware for a chain's endpoints, a provider over it and
 * a block tracker polling that provider: the base every network client builds
 * its middleware on.
 *
 * @param {string[]} rpcUrls - The endpoints, tried in order.
 * @param {object} [blockTrackerOptions] - Extra PollingBlockTracker options.
 * @returns {{ fetchMiddleware: Function, provider: object, blockTracker: object }}
 * The fetch middleware, its provider and the block tracker.
 */
export default function createFetchClient(rpcUrls, blockTrackerOptions = {}) {
  const fetchMiddleware = createFetchMiddleware({
    rpcService: createRpcService({ rpcUrls }),
  });
  const provider = providerFromMiddlewareV2(fetchMiddleware);
  const blockTracker = new PollingBlockTracker({
    ...blockTrackerOptions,
    provider,
  });
  return { fetchMiddleware, provider, blockTracker };
}
