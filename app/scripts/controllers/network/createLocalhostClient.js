import {
  createBlockRefRewriteMiddleware,
  createBlockTrackerInspectorMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import { asLegacyMiddleware } from '@metamask/json-rpc-engine/v2';

import createFetchClient from './createFetchClient';

const inTest = process.env.IN_TEST === 'true';

export default function createLocalhostClient() {
  const { fetchMiddleware, blockTracker } = createFetchClient(
    ['http://localhost:8545/'],
    { pollingInterval: 1000 },
  );

  const networkMiddleware = asLegacyMiddleware(
    createEstimateGasMiddleware(),
    createBlockRefRewriteMiddleware({ blockTracker }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  );
  return { networkMiddleware, blockTracker };
}

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function createEstimateGasMiddleware() {
  return async ({ request, next }) => {
    if (request.method === 'eth_estimateGas' && inTest) {
      await delay(2000);
    }
    return next();
  };
}
