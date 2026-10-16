import ObjectMultiplex from '@metamask/object-multiplex';
import { MetaMaskInpageProvider } from '@metamask/providers';
import { strict as assert } from 'assert';
import pump from 'pump';
import sinon from 'sinon';

import ReconnectingPortStream from '../../../app/scripts/lib/reconnecting-port-stream';

describe('Manifest V3 dapp connections', function () {
  function createPort() {
    const port = {
      onMessage: { addListener: sinon.stub() },
      onDisconnect: { addListener: sinon.stub() },
      postMessage: sinon.stub(),
      disconnect: sinon.stub(),
    };
    return port;
  }

  function request(id) {
    return { name: 'provider', data: { id, method: 'personal_sign' } };
  }

  function assertReloadError(message, id) {
    assert.equal(message.name, 'provider');
    assert.equal(message.data.id, id);
    assert.equal(message.data.error.code, 4900);
    assert.match(message.data.error.message, /refresh/iu);
  }

  it('reads the disconnect error so the browser does not report it as unchecked', function () {
    const port = createPort();
    const stream = new ReconnectingPortStream(() => port);
    const originalChrome = globalThis.chrome;
    let lastErrorRead = false;
    globalThis.chrome = {
      runtime: {
        get lastError() {
          lastErrorRead = true;
          return {
            message:
              'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
          };
        },
      },
    };
    try {
      port.onDisconnect.addListener.firstCall.args[0]();
    } finally {
      globalThis.chrome = originalChrome;
    }
    assert.equal(lastErrorRead, true);
    stream.destroy();
  });

  it('rejects requests after context invalidation during reconnect without breaking the stream', function () {
    const port = createPort();
    const connect = sinon.stub().returns(port);
    connect.onSecondCall().throws(new Error('Extension context invalidated.'));
    const stream = new ReconnectingPortStream(connect);
    const onError = sinon.spy();
    stream.on('error', onError);
    port.onDisconnect.addListener.firstCall.args[0]();

    stream.write(request(1));
    assertReloadError(stream.read(), 1);
    stream.write(request(2));
    assertReloadError(stream.read(), 2);
    assert.equal(
      connect.callCount,
      2,
      'an invalidated context cannot reconnect',
    );
    assert.equal(onError.callCount, 0);
    assert.equal(stream.destroyed, false);
    stream.destroy();
  });

  it('handles an already invalidated context on initial connection', function () {
    const connect = sinon
      .stub()
      .throws(new Error('Extension context invalidated.'));
    const stream = new ReconnectingPortStream(connect);
    stream.write(request(0));
    assertReloadError(stream.read(), 0);
    assert.equal(connect.callCount, 1);
    stream.destroy();
  });

  it('rejects every pending request when postMessage detects invalidation', function () {
    const port = createPort();
    const stream = new ReconnectingPortStream(() => port);
    stream.on('error', () => undefined);
    stream.write(request(1));
    port.postMessage.throws(new Error('Extension context invalidated.'));
    port.disconnect.throws(new Error('Extension context invalidated.'));
    stream.write(request(2));
    assertReloadError(stream.read(), 1);
    assertReloadError(stream.read(), 2);
    stream.write(request(3));
    assertReloadError(stream.read(), 3);
    assert.equal(port.postMessage.callCount, 2);
    assert.equal(stream.pending.size, 0);
    stream.destroy();
  });

  it('does not hide unexpected connection failures', function () {
    const error = new Error('Unexpected connection failure');
    assert.throws(
      () =>
        new ReconnectingPortStream(() => {
          throw error;
        }),
      error,
    );
  });

  it('can destroy a port whose context was invalidated', function (done) {
    const port = createPort();
    port.disconnect.throws(new Error('Extension context invalidated.'));
    const stream = new ReconnectingPortStream(() => port);
    stream.on('error', done);
    stream.destroy(null, done);
  });

  it('keeps a request made synchronously in response to a worker disconnect pending', function (done) {
    const firstPort = createPort();
    const secondPort = createPort();
    const connect = sinon.stub().returns(firstPort);
    connect.onSecondCall().returns(secondPort);
    const stream = new ReconnectingPortStream(connect);
    stream.write(request(1));
    stream.once('data', () => {
      stream.write(request(2));
    });
    // Wait until the readable stream is flowing so the response is synchronous.
    setImmediate(() => {
      firstPort.onDisconnect.addListener.firstCall.args[0]();
      assert.equal(stream.pending.has(2), true);
      assert.equal(secondPort.postMessage.callCount, 1);
      stream.destroy();
      done();
    });
  });

  it('reconnects on the next request and never replays an interrupted signing request', function (done) {
    const ports = [];
    const stream = new ReconnectingPortStream(() => {
      const listeners = {};
      const port = {
        sent: [],
        onMessage: {
          addListener(listener) {
            listeners.message = listener;
          },
        },
        onDisconnect: {
          addListener(listener) {
            listeners.disconnect = listener;
          },
        },
        postMessage(message) {
          this.sent.push(message);
        },
        disconnect() {
          listeners.disconnect();
        },
      };
      ports.push(port);
      return port;
    });
    stream.once('data', (message) => {
      assert.equal(message.data.id, 1);
      assert.equal(message.data.error.code, 4900);
      assert.equal(
        ports.length,
        1,
        'idle workers must not be woken by a reconnection loop',
      );
      stream.write(
        { name: 'provider', data: { id: 2, method: 'eth_chainId' } },
        (error) => {
          assert.ifError(error);
          assert.equal(ports.length, 2);
          assert.deepEqual(
            ports[1].sent.map((packet) => packet.data.method),
            ['eth_chainId'],
          );
          stream.destroy();
          done();
        },
      );
    });
    stream.write({
      name: 'provider',
      data: { id: 1, method: 'personal_sign' },
    });
    ports[0].disconnect();
  });

  describe('Manifest V3 subscriptions after a worker restart', function () {
    const NETWORK = { chainId: '0x1', networkVersion: '1', isConnected: true };

    // Ports to a background worker that answers requests and, as
    // setupProviderConnection does, reports the chain on every connection.
    function createBackground() {
      const ports = [];
      let subscriptions = 0;
      const answer = (method) => {
        if (method === 'metamask_getProviderState') {
          return { ...NETWORK, isUnlocked: true, accounts: [] };
        }
        if (method === 'eth_subscribe' || method === 'eth_newBlockFilter') {
          subscriptions += 1;
          return `0x${subscriptions.toString(16).padStart(32, '0')}`;
        }
        return method === 'eth_unsubscribe' ? true : null;
      };
      const connect = () => {
        const listeners = {};
        const port = {
          onMessage: {
            addListener(listener) {
              listeners.message = listener;
            },
          },
          onDisconnect: {
            addListener(listener) {
              listeners.disconnect = listener;
            },
          },
          postMessage({ data: { id, method } }) {
            const result = answer(method);
            queueMicrotask(() =>
              listeners.message({
                name: 'provider',
                data: { jsonrpc: '2.0', id, result },
              }),
            );
          },
          disconnect: sinon.stub(),
          // The worker was stopped.
          stop() {
            listeners.disconnect();
          },
        };
        ports.push(port);
        queueMicrotask(() =>
          listeners.message({
            name: 'provider',
            data: {
              jsonrpc: '2.0',
              method: 'metamask_chainChanged',
              params: NETWORK,
            },
          }),
        );
        return port;
      };
      return { ports, connect };
    }

    function createStream(background) {
      const stream = new ReconnectingPortStream(background.connect);
      let nextId = 0;
      stream.request = (method, params = []) =>
        new Promise((resolve) => {
          nextId += 1;
          const id = nextId;
          const onData = (message) => {
            if (message.data.id === id) {
              stream.removeListener('data', onData);
              resolve(message.data.result);
            }
          };
          stream.on('data', onData);
          stream.write({
            name: 'provider',
            data: { jsonrpc: '2.0', id, method, params },
          });
        });
      return stream;
    }

    function nextNotification(stream) {
      return new Promise((resolve) => {
        const onData = (message) => {
          if (message.data.method) {
            stream.removeListener('data', onData);
            resolve(message.data);
          }
        };
        stream.on('data', onData);
      });
    }

    async function settle() {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    it('reports lost subscriptions as a recoverable disconnect, and reconnects at once', async function () {
      const background = createBackground();
      const stream = createStream(background);
      await stream.request('metamask_getProviderState');
      await stream.request('eth_subscribe', ['newHeads']);
      await settle();

      const disconnected = nextNotification(stream);
      background.ports[0].stop();
      assert.deepEqual((await disconnected).params, {
        ...NETWORK,
        isConnected: false,
      });
      assert.equal(background.ports.length, 2, 'reconnects without a request');

      const reconnected = await nextNotification(stream);
      assert.deepEqual(reconnected.params, NETWORK);

      // The new worker holds nothing for the page; stopping it changes nothing.
      background.ports[1].stop();
      await settle();
      assert.equal(background.ports.length, 2);
      stream.destroy();
    });

    it('counts filters, and forgets subscriptions the page ended', async function () {
      const background = createBackground();
      const stream = createStream(background);
      const filterId = await stream.request('eth_newBlockFilter');
      await stream.request('eth_uninstallFilter', [filterId]);
      const subscriptionId = await stream.request('eth_subscribe', [
        'newHeads',
      ]);
      await stream.request('eth_unsubscribe', [subscriptionId.toUpperCase()]);
      await settle();

      const messages = [];
      stream.on('data', (message) => messages.push(message));
      background.ports[0].stop();
      await settle();
      assert.deepEqual(messages, []);
      assert.equal(
        background.ports.length,
        1,
        'idle workers must not be woken when the page held nothing',
      );

      stream.removeAllListeners('data');
      await stream.request('eth_newBlockFilter');
      await settle();
      const disconnected = nextNotification(stream);
      background.ports[1].stop();
      assert.equal((await disconnected).params.isConnected, false);
      stream.destroy();
    });

    it('makes the provider emit disconnect (1013) and then connect', async function () {
      const background = createBackground();
      const stream = new ReconnectingPortStream(background.connect);
      const mux = new ObjectMultiplex();
      pump(mux, stream, mux, () => undefined);
      const logger = {
        debug: () => undefined,
        info: () => undefined,
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      };
      const provider = new MetaMaskInpageProvider(
        mux.createStream('provider'),
        {
          logger,
          shouldSendMetadata: false,
        },
      );
      await new Promise((resolve) => provider.once('_initialized', resolve));
      assert.equal(provider.isConnected(), true);
      await provider.request({ method: 'eth_subscribe', params: ['newHeads'] });

      const events = [];
      provider.on('disconnect', (error) =>
        events.push(['disconnect', error.code]),
      );
      provider.on('connect', ({ chainId }) =>
        events.push(['connect', chainId]),
      );
      background.ports[0].stop();
      await settle();

      assert.deepEqual(events, [
        ['disconnect', 1013],
        ['connect', NETWORK.chainId],
      ]);
      assert.equal(provider.isConnected(), true);
      assert.equal(provider.chainId, NETWORK.chainId);
      stream.destroy();
    });
  });
});
