import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import createOriginMiddleware from '../../../app/scripts/lib/createOriginMiddleware';
import createTabIdMiddleware from '../../../app/scripts/lib/createTabIdMiddleware';

const TAB_ID_NONE = -1;

const { default: createOnboardingMiddleware } = proxyquire(
  '../../../app/scripts/lib/createOnboardingMiddleware',
  {
    './extension-api': {
      __esModule: true,
      default: { tabs: { TAB_ID_NONE } },
      '@noCallThru': true,
    },
  },
);

function engineWith(...middleware) {
  const engine = new JsonRpcEngine();
  for (const item of middleware) {
    engine.push(item);
  }
  return engine;
}

// Ends each request with the fields the middleware before it left on it.
function captureRequest(captured) {
  return (req, res, _next, end) => {
    captured.push({ origin: req.origin, tabId: req.tabId });
    res.result = 'done';
    end();
  };
}

describe('provider request middleware', function () {
  describe('createOriginMiddleware', function () {
    it('replaces an origin the caller supplied with the connection origin', async function () {
      const captured = [];
      const engine = engineWith(
        createOriginMiddleware({ origin: 'https://site.example' }),
        captureRequest(captured),
      );
      await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_accounts',
        origin: 'https://other.example',
      });
      assert.deepEqual(captured, [
        { origin: 'https://site.example', tabId: undefined },
      ]);
    });
  });

  describe('createTabIdMiddleware', function () {
    it('sets the tab of the connection', async function () {
      const captured = [];
      const engine = engineWith(
        createTabIdMiddleware({ tabId: 7 }),
        captureRequest(captured),
      );
      await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_accounts',
        tabId: 99,
      });
      assert.equal(captured[0].tabId, 7);
    });

    it('removes a tab the caller supplied when the connection has none', async function () {
      const captured = [];
      const engine = engineWith(
        createTabIdMiddleware({ tabId: undefined }),
        captureRequest(captured),
      );
      await engine.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_accounts',
        tabId: 99,
      });
      assert.equal(captured[0].tabId, undefined);
    });
  });

  describe('createOnboardingMiddleware', function () {
    const location = 'https://onboarding.example/start';

    function request(fields = {}) {
      return {
        jsonrpc: '2.0',
        id: 1,
        method: 'wallet_registerOnboarding',
        ...fields,
      };
    }

    it('passes other methods on', async function () {
      const registerOnboarding = sinon.spy();
      const captured = [];
      const engine = engineWith(
        createOnboardingMiddleware({ location, registerOnboarding }),
        captureRequest(captured),
      );
      const response = await engine.handle(
        request({ method: 'eth_accounts', tabId: 3 }),
      );
      assert.equal(response.result, 'done');
      assert.equal(registerOnboarding.called, false);
    });

    it('registers the sender location for its tab', async function () {
      const registerOnboarding = sinon.stub().resolves();
      const engine = engineWith(
        createTabIdMiddleware({ tabId: 3 }),
        createOnboardingMiddleware({ location, registerOnboarding }),
      );
      const response = await engine.handle(request({ tabId: 99 }));
      assert.equal(response.result, true);
      assert.deepEqual(registerOnboarding.args, [[location, 3]]);
    });

    it('ignores a tab supplied by a sender without one', async function () {
      // Another extension has no tab; the tab ID it sends must not register
      // onboarding for a tab it does not own.
      const registerOnboarding = sinon.stub().resolves();
      const engine = engineWith(
        createTabIdMiddleware({ tabId: undefined }),
        createOnboardingMiddleware({ location, registerOnboarding }),
      );
      const response = await engine.handle(request({ tabId: 3 }));
      assert.equal(response.result, true);
      assert.equal(registerOnboarding.called, false);
    });

    it('ignores requests without a real tab', async function () {
      const registerOnboarding = sinon.stub().resolves();
      const engine = engineWith(
        createTabIdMiddleware({ tabId: TAB_ID_NONE }),
        createOnboardingMiddleware({ location, registerOnboarding }),
      );
      const response = await engine.handle(request());
      assert.equal(response.result, true);
      assert.equal(registerOnboarding.called, false);
    });

    it('returns a registration error', async function () {
      const registerOnboarding = sinon.stub().rejects(new Error('cannot'));
      const engine = engineWith(
        createTabIdMiddleware({ tabId: 3 }),
        createOnboardingMiddleware({ location, registerOnboarding }),
      );
      const response = await engine.handle(request());
      assert.equal(response.result, undefined);
      assert.match(response.error.message, /cannot/u);
    });
  });
});
