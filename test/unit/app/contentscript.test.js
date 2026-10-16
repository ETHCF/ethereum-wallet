import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import { Duplex } from 'readable-stream';
import sinon from 'sinon';

import { PHISHING_CHECK } from '../../../app/scripts/lib/phishing-warnings';
import { flush } from '../../lib/page-globals';

// Stands in for the window.postMessage transport to the inpage script.
class FakePageStream extends Duplex {
  static instances = [];

  constructor(options) {
    super({ objectMode: true });
    this.options = options;
    this.written = [];
    FakePageStream.instances.push(this);
  }

  _read() {
    // Messages are pushed by the test.
  }

  _write(chunk, _encoding, callback) {
    this.written.push(chunk);
    callback();
  }
}

function fakePort() {
  const messageListeners = [];
  return {
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    },
    receive(message) {
      messageListeners.forEach((listener) => listener(message));
    },
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: () => undefined },
    disconnect: () => undefined,
  };
}

function loadContentScript({ inject, sendMessage = sinon.stub().resolves() }) {
  const port = fakePort();
  const runtime = { connect: sinon.stub().returns(port), sendMessage };
  proxyquire('../../../app/scripts/contentscript', {
    '@metamask/post-message-stream': {
      WindowPostMessageStream: FakePageStream,
    },
    './lib/should-inject-provider': {
      __esModule: true,
      default: () => inject,
      '@noCallThru': true,
    },
    './lib/extension-api': {
      __esModule: true,
      default: { runtime },
      '@noCallThru': true,
    },
  });
  return { port, runtime, page: FakePageStream.instances.at(-1) };
}

describe('content script', function () {
  beforeEach(function () {
    FakePageStream.instances = [];
  });

  describe('on a page that does not get the provider', function () {
    it('asks for a phishing check instead of connecting', async function () {
      const { runtime } = loadContentScript({ inject: false });
      assert.deepEqual(runtime.sendMessage.args, [[{ type: PHISHING_CHECK }]]);
      assert.equal(runtime.connect.called, false);
      assert.equal(FakePageStream.instances.length, 0);
    });

    it('ignores a failed check request', async function () {
      loadContentScript({
        inject: false,
        sendMessage: sinon.stub().rejects(new Error('no receiver')),
      });
      // An unhandled rejection would fail the test run.
      await flush();
    });
  });

  describe('on a page that gets the provider', function () {
    it('connects to the background, which checks it for phishing', function () {
      const { runtime, page } = loadContentScript({ inject: true });
      assert.deepEqual(runtime.connect.args, [[{ name: 'contentscript' }]]);
      assert.equal(runtime.sendMessage.called, false);
      assert.deepEqual(page.options, {
        name: 'ecf-wallet-contentscript',
        target: 'ecf-wallet-inpage',
      });
    });

    it('forwards the provider channel in both directions', async function () {
      const { port, page } = loadContentScript({ inject: true });
      const request = { jsonrpc: '2.0', id: 1, method: 'eth_chainId' };
      page.push({ name: 'provider', data: request });
      await flush();
      assert.deepEqual(port.posted, [{ name: 'provider', data: request }]);

      const response = { jsonrpc: '2.0', id: 1, result: '0x1' };
      port.receive({ name: 'provider', data: response });
      await flush();
      assert.deepEqual(page.written, [{ name: 'provider', data: response }]);
    });

    it('forwards no other channel', async function () {
      // ObjectMultiplex warns about each message it drops.
      const warn = sinon.stub(console, 'warn');
      try {
        const { port, page } = loadContentScript({ inject: true });
        page.push({ name: 'publicConfig', data: { method: 'x', id: 2 } });
        page.push({ name: 'controller', data: { method: 'x', id: 3 } });
        await flush();
        assert.deepEqual(port.posted, []);

        port.receive({ name: 'controller', data: { secret: true } });
        await flush();
        assert.deepEqual(page.written, []);
        assert.equal(warn.callCount, 3);
      } finally {
        warn.restore();
      }
    });
  });
});
