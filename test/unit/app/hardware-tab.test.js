import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { flush } from '../../lib/page-globals';

const backgroundUrl = 'chrome-extension://wallet/service-worker.js';

function loadHardwareTab(performRequest, tabs = { update: sinon.spy() }) {
  let listener;
  const runtime = {
    id: 'wallet',
    getURL: (path) => `chrome-extension://wallet/${path}`,
    getContexts: async () => [],
    onMessage: { addListener: (added) => (listener = added) },
  };
  proxyquire('../../../app/scripts/hardware', {
    './lib/extension-api': {
      __esModule: true,
      default: {
        runtime,
        tabs: { getCurrent: async () => ({ id: 1, windowId: 1 }), ...tabs },
      },
      '@noCallThru': true,
    },
    './lib/hardware-transport': {
      createHardwareRequestHandler: () => performRequest,
      '@noCallThru': true,
    },
  });
  return async (message, respond) => {
    const async = listener(
      { type: 'ecf-wallet-hardware-request', ...message },
      { id: 'wallet', url: backgroundUrl },
      respond,
    );
    await flush();
    return async;
  };
}

describe('Hardware connection tab', function () {
  it('responds with the result of a request', async function () {
    const send = loadHardwareTab(sinon.stub().resolves({ result: 1 }));
    const respond = sinon.spy();
    assert.equal(await send({}, respond), true);
    assert.deepEqual(respond.args, [[{ result: 1 }]]);
  });

  it('responds with the message of a failed request', async function () {
    const send = loadHardwareTab(sinon.stub().rejects(new Error('No device')));
    const respond = sinon.spy();
    await send({}, respond);
    assert.deepEqual(respond.args, [[{ error: 'No device' }]]);
  });

  it('responds when a request rejects with something other than an Error', async function () {
    const send = loadHardwareTab(sinon.stub().rejects({ message: 42 }));
    const respond = sinon.spy();
    await send({}, respond);
    assert.deepEqual(respond.args, [
      [{ error: 'Hardware wallet request failed. Please retry.' }],
    ]);
  });

  it('responds with an error when the result cannot be sent', async function () {
    const send = loadHardwareTab(sinon.stub().resolves({ result: 1 }));
    const respond = sinon.stub();
    respond.onFirstCall().throws(new Error('Could not serialize message'));
    await send({}, respond);
    assert.deepEqual(respond.secondCall.args, [
      { error: 'Could not serialize message' },
    ]);
  });

  it('ignores messages that are not hardware requests', function () {
    const send = loadHardwareTab(sinon.stub().resolves({}));
    return send({ type: 'other' }, sinon.spy()).then((async) =>
      assert.equal(async, false),
    );
  });

  describe('after Trezor Connect closes its popup', function () {
    let visibility, clock;

    beforeEach(function () {
      visibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibility,
      });
      clock = sinon.useFakeTimers({ toFake: ['Date'] });
    });

    afterEach(function () {
      clock.restore();
      delete document.visibilityState;
    });

    function loadWithWallet() {
      const tabs = { update: sinon.stub().resolves() };
      const send = loadHardwareTab(sinon.stub().resolves({ result: 1 }), tabs);
      return { send, tabs };
    }

    function show() {
      visibility = 'visible';
      document.dispatchEvent(new window.Event('visibilitychange'));
      return flush();
    }

    // getContexts is stubbed per load, so give this load a wallet in this
    // window, one in another window, and an unrelated extension page.
    async function sendWithContexts(send) {
      const proxied = proxyquire.callThru;
      assert.ok(proxied);
      await send({}, sinon.spy());
    }

    it('returns to the wallet tab in its window when it is shown', async function () {
      const update = sinon.stub().resolves();
      let listener;
      proxyquire('../../../app/scripts/hardware', {
        './lib/extension-api': {
          __esModule: true,
          default: {
            runtime: {
              id: 'wallet',
              getURL: (path) => `chrome-extension://wallet/${path}`,
              getContexts: async () => [
                {
                  tabId: 7,
                  windowId: 2,
                  documentUrl: 'chrome-extension://wallet/home.html#/',
                },
                {
                  tabId: 8,
                  windowId: 1,
                  documentUrl: 'chrome-extension://wallet/hardware.html',
                },
                {
                  tabId: 9,
                  windowId: 1,
                  documentUrl:
                    'chrome-extension://wallet/home.html#/new-account/connect',
                },
              ],
              onMessage: { addListener: (added) => (listener = added) },
            },
            tabs: {
              getCurrent: async () => ({ id: 8, windowId: 1 }),
              update,
            },
          },
          '@noCallThru': true,
        },
        './lib/hardware-transport': {
          createHardwareRequestHandler: () => sinon.stub().resolves({}),
          '@noCallThru': true,
        },
      });
      listener(
        { type: 'ecf-wallet-hardware-request' },
        { id: 'wallet', url: backgroundUrl },
        sinon.spy(),
      );
      await flush();
      assert.equal(update.callCount, 0, 'waits until the tab is shown');
      await show();
      assert.deepEqual(update.args, [[9, { active: true }]]);
      await show();
      assert.equal(update.callCount, 1, 'returns only once per response');
    });

    it('stays when shown long after the last response', async function () {
      const { send, tabs } = loadWithWallet();
      await send({}, sinon.spy());
      clock.tick(5000);
      await show();
      assert.equal(tabs.update.callCount, 0);
    });

    it('stays when there is no wallet tab in its window', async function () {
      const { send, tabs } = loadWithWallet();
      await send({}, sinon.spy());
      await show();
      assert.equal(tabs.update.callCount, 0);
    });
  });
});
