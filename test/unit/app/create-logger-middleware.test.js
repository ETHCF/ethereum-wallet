import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { strict as assert } from 'assert';

import createLoggerMiddleware from '../../../app/scripts/lib/createLoggerMiddleware';

describe('createLoggerMiddleware', function () {
  it('answers every request, whatever fields the page adds to it', async function () {
    const engine = new JsonRpcEngine();
    engine.push(createLoggerMiddleware({ origin: 'https://dapp.test' }));
    engine.push((_req, res, _next, end) => {
      res.result = 'ok';
      end();
    });
    const answer = await Promise.race([
      engine.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        isEcfWalletInternal: true,
      }),
      new Promise((resolve) => setTimeout(resolve, 1000, 'no answer')),
    ]);
    assert.equal(answer.result, 'ok');
  });
});
