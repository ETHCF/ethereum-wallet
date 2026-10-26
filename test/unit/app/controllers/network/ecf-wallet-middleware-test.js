import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import assert from 'assert';

import createEcfWalletMiddleware from '../../../../../app/scripts/controllers/network/createEcfWalletMiddleware';

const ACCOUNT = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc';
const OTHER = '0xec1adf982415d2ef5ec55899b9bfb8bc0f29251b';
const MESSAGE = '0x68656c6c6f';

describe('createEcfWalletMiddleware', function () {
  function createEngine(overrides = {}) {
    const engine = new JsonRpcEngine();
    engine.push((req, _res, next) => {
      req.origin = 'https://example.com';
      next();
    });
    engine.push(
      createEcfWalletMiddleware({
        version: '1.0.0',
        getAccounts: async () => [ACCOUNT],
        processPersonalMessage: async (msgParams) => msgParams.from,
        getPendingNonce: async () => undefined,
        getPendingTransactionByHash: () => undefined,
        getChainId: () => '0x1',
        ...overrides,
      }),
    );
    return engine;
  }

  function personalSign(engine, from, extra = {}) {
    return engine.handle({
      id: 1,
      jsonrpc: '2.0',
      method: 'personal_sign',
      params: [MESSAGE, from],
      ...extra,
    });
  }

  it('signs for a permitted account', async function () {
    const res = await personalSign(createEngine(), ACCOUNT);
    assert.equal(res.error, undefined);
    assert.equal(res.result, ACCOUNT);
  });

  it('refuses an account the origin is not permitted to use', async function () {
    const res = await personalSign(createEngine(), OTHER);
    assert.equal(res.error.code, 4100);
  });

  it('replaces a network client ID sent by the page', async function () {
    const engine = createEngine();
    engine.push((req, res, _next, end) => {
      res.result = req.networkClientId;
      end();
    });
    const res = await engine.handle({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      networkClientId: 'mainnet',
    });
    assert.equal(res.result, 'selected');
  });
});
