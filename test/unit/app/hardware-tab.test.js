import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { flush } from '../../lib/page-globals';

const backgroundUrl = 'chrome-extension://wallet/service-worker.js';
const walletUrl = 'chrome-extension://wallet/home.html';
const HARDWARE_TAB = 1;

// A browser with the connection tab in window 1. Each tab is
// { windowId, active, url }, where url is set for extension pages only.
function createBrowser(tabs = {}) {
  const all = new Map(
    Object.entries({
      [HARDWARE_TAB]: {
        windowId: 1,
        url: 'chrome-extension://wallet/hardware.html',
      },
      ...tabs,
    }).map(([id, tab]) => [Number(id), { id: Number(id), ...tab }]),
  );
  const activate = (id) => {
    const { windowId } = all.get(id);
    for (const tab of all.values()) {
      if (tab.windowId === windowId) {
        tab.active = tab.id === id;
      }
    }
  };
  return {
    all,
    activate,
    activeTab: (windowId) =>
      [...all.values()].find((tab) => tab.windowId === windowId && tab.active)
        ?.id,
    runtime: {
      getContexts: async () =>
        [...all.values()]
          .filter((tab) => tab.url)
          .map((tab) => ({
            tabId: tab.id,
            windowId: tab.windowId,
            documentUrl: tab.url,
          })),
    },
    tabs: {
      getCurrent: async () => all.get(HARDWARE_TAB),
      query: async ({ active, windowId }) =>
        [...all.values()]
          .filter((tab) => tab.active === active && tab.windowId === windowId)
          .map(({ id, windowId: tabWindowId }) => ({
            id,
            windowId: tabWindowId,
          })),
      update: sinon.spy(async (id) => {
        if (!all.has(id)) {
          throw new Error(`No tab with id: ${id}.`);
        }
        activate(id);
      }),
    },
  };
}

function loadHardwareTab(performRequest, browser = createBrowser()) {
  let listener;
  const runtime = {
    id: 'wallet',
    getURL: (path) => `chrome-extension://wallet/${path}`,
    onMessage: { addListener: (added) => (listener = added) },
    ...browser.runtime,
  };
  proxyquire('../../../app/scripts/hardware', {
    './lib/extension-api': {
      __esModule: true,
      default: { runtime, tabs: browser.tabs },
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

  it('still performs the request when the active tab cannot be read', async function () {
    const browser = createBrowser();
    browser.tabs.query = async () => {
      throw new Error('No window');
    };
    const send = loadHardwareTab(sinon.stub().resolves({ result: 1 }), browser);
    const respond = sinon.spy();
    await send({}, respond);
    assert.deepEqual(respond.args, [[{ result: 1 }]]);
  });

  it('ignores messages that are not hardware requests', function () {
    const send = loadHardwareTab(sinon.stub().resolves({}));
    return send({ type: 'other' }, sinon.spy()).then((async) =>
      assert.equal(async, false),
    );
  });

  // Trezor Connect's popup is opened by this tab, so the browser shows this
  // tab when the popup closes.
  describe('when the popup closes onto it', function () {
    let visibility, clock;

    beforeEach(function () {
      visibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibility,
      });
      clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
    });

    afterEach(function () {
      clock.restore();
      delete document.visibilityState;
    });

    function closePopup(browser) {
      browser.activate(HARDWARE_TAB);
      visibility = 'visible';
      document.dispatchEvent(new window.Event('visibilitychange'));
      return flush();
    }

    function deferredRequest() {
      let resolve;
      const performRequest = sinon.stub().returns(
        new Promise((_resolve) => {
          resolve = _resolve;
        }),
      );
      return { performRequest, resolve: (value) => resolve(value) };
    }

    it('returns to the wallet after the response', async function () {
      const browser = createBrowser({
        9: {
          windowId: 1,
          active: true,
          url: `${walletUrl}#/new-account/connect`,
        },
      });
      const send = loadHardwareTab(sinon.stub().resolves({}), browser);
      await send({}, sinon.spy());
      assert.equal(browser.activeTab(1), 9);
      await closePopup(browser);
      assert.equal(browser.activeTab(1), 9);
    });

    it('returns to the wallet when it closes before the response', async function () {
      const browser = createBrowser({
        9: {
          windowId: 1,
          active: true,
          url: `${walletUrl}#/new-account/connect`,
        },
      });
      const { performRequest, resolve } = deferredRequest();
      const send = loadHardwareTab(performRequest, browser);
      const respond = sinon.spy();
      await send({}, respond);
      await closePopup(browser);
      assert.equal(browser.activeTab(1), HARDWARE_TAB, 'waits for the result');
      resolve({ result: 1 });
      await flush();
      assert.deepEqual(respond.args, [[{ result: 1 }]]);
      assert.equal(browser.activeTab(1), 9);
    });

    it('returns to the page that was shown when the request arrived', async function () {
      // A signature requested by a site, approved in the wallet's own window.
      const browser = createBrowser({
        5: { windowId: 1, active: true },
        9: { windowId: 1, url: `${walletUrl}#/` },
      });
      const send = loadHardwareTab(sinon.stub().resolves({}), browser);
      await send({}, sinon.spy());
      await closePopup(browser);
      assert.equal(browser.activeTab(1), 5);
    });

    it('returns to the connect page in its window if that page was closed', async function () {
      const browser = createBrowser({
        5: { windowId: 1, active: true },
        8: { windowId: 1, url: `${walletUrl}#/` },
        9: { windowId: 1, url: `${walletUrl}#/new-account/connect` },
        10: {
          windowId: 2,
          active: true,
          url: `${walletUrl}#/new-account/connect`,
        },
      });
      const send = loadHardwareTab(sinon.stub().resolves({}), browser);
      await send({}, sinon.spy());
      browser.all.delete(5);
      await closePopup(browser);
      assert.equal(browser.activeTab(1), 9);
    });

    it('returns only once per response', async function () {
      const browser = createBrowser({
        9: { windowId: 1, active: true, url: walletUrl },
      });
      const send = loadHardwareTab(sinon.stub().resolves({}), browser);
      await send({}, sinon.spy());
      await closePopup(browser);
      visibility = 'hidden';
      await closePopup(browser);
      assert.equal(browser.activeTab(1), HARDWARE_TAB);
      assert.equal(browser.tabs.update.callCount, 1);
    });

    it('stays when shown long after the response', async function () {
      const browser = createBrowser({
        9: { windowId: 1, active: true, url: walletUrl },
      });
      const send = loadHardwareTab(sinon.stub().resolves({}), browser);
      await send({}, sinon.spy());
      clock.tick(5000);
      await closePopup(browser);
      assert.equal(browser.tabs.update.callCount, 0);
    });

    it('stays when it was already shown and no wallet is open', async function () {
      const browser = createBrowser({ 5: { windowId: 1 } });
      browser.activate(HARDWARE_TAB);
      const send = loadHardwareTab(sinon.stub().resolves({}), browser);
      await send({}, sinon.spy());
      await closePopup(browser);
      assert.equal(browser.activeTab(1), HARDWARE_TAB);
      assert.equal(browser.tabs.update.callCount, 0);
    });
  });
});
