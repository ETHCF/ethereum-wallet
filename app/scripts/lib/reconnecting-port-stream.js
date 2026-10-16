import { Duplex } from 'readable-stream';

import readDisconnectError from './read-disconnect-error';

const RELOAD_MESSAGE =
  'ecf-wallet was reloaded or updated. Please refresh this page to reconnect.';

// Requests whose result names state kept by the background for the page.
const STATEFUL_METHODS = new Set([
  'eth_subscribe',
  'eth_newFilter',
  'eth_newBlockFilter',
  'eth_newPendingTransactionFilter',
]);
// Requests that release that state; the ID is the first parameter.
const RELEASING_METHODS = new Set(['eth_unsubscribe', 'eth_uninstallFilter']);

/**
 * A dapp connection reconnects on demand after a background worker suspends.
 * Outstanding RPC requests fail explicitly; signing requests are never replayed.
 *
 * Subscriptions and filters live in the background and are lost with it. If
 * the page had any, the provider is told it was disconnected and then, once
 * reconnected, that it is connected again: the EIP-1193 `disconnect` (code
 * 1013, try again) and `connect` events, on which libraries subscribe again.
 * Without any, an idle worker is left suspended until the page's next request.
 */
export default class ReconnectingPortStream extends Duplex {
  constructor(connect) {
    super({ objectMode: true });
    this.connect = connect;
    this.port = null;
    // Request IDs, mapped to their method, awaiting a response.
    this.pending = new Map();
    // IDs of the page's subscriptions and filters in the background.
    this.liveIds = new Set();
    // The chain last reported to the provider, needed to report a disconnect.
    this.network = null;
    this.contextInvalidated = false;
    this.open();
  }

  open() {
    if (this.port || this.contextInvalidated) {
      return;
    }
    let port;
    try {
      port = this.connect();
    } catch (error) {
      if (!this.handleContextInvalidation(error)) {
        throw error;
      }
      return;
    }
    this.port = port;
    port.onMessage.addListener((message) => {
      if (port !== this.port) {
        return;
      }
      if (message.name === 'provider') {
        this.observe(message.data);
      }
      this.push(message);
    });
    port.onDisconnect.addListener(() => {
      readDisconnectError(port);
      if (port !== this.port) {
        return;
      }
      this.port = null;
      this.failPending('ecf-wallet restarted. Please retry your request.');
      this.reportLostState();
    });
  }

  /**
   * Notes, from a message the background sent to the page, the chain and the
   * subscriptions and filters the page holds.
   *
   * @param {object} data - The JSON-RPC response or notification
   */
  observe(data) {
    if (!data) {
      return;
    }
    if (data.method === 'metamask_chainChanged') {
      this.noteNetwork(data.params);
      return;
    }
    if (data.id === undefined) {
      return;
    }
    const method = this.pending.get(data.id);
    this.pending.delete(data.id);
    if (data.error) {
      return;
    }
    if (STATEFUL_METHODS.has(method) && typeof data.result === 'string') {
      this.liveIds.add(data.result.toLowerCase());
    } else if (method === 'metamask_getProviderState') {
      this.noteNetwork(data.result);
    }
  }

  noteNetwork(params) {
    if (params?.chainId) {
      const { chainId, networkVersion } = params;
      this.network = { chainId, networkVersion };
    }
  }

  /**
   * After the background restarted, tells the provider its subscriptions and
   * filters are gone, by reporting the chain disconnected, and reconnects at
   * once: the background then reports the chain connected again.
   */
  reportLostState() {
    if (this.liveIds.size === 0) {
      return;
    }
    this.liveIds.clear();
    if (!this.network) {
      // The provider is not connected before it knows the chain.
      return;
    }
    this.push({
      name: 'provider',
      data: {
        jsonrpc: '2.0',
        method: 'metamask_chainChanged',
        params: { ...this.network, isConnected: false },
      },
    });
    try {
      this.open();
    } catch (error) {
      this.destroy(error);
    }
  }

  failPending(message) {
    const ids = Array.from(this.pending.keys());
    // Clear before pushing: a response can synchronously trigger another request.
    this.pending.clear();
    for (const id of ids) {
      this.push({
        name: 'provider',
        data: {
          jsonrpc: '2.0',
          id,
          error: { code: 4900, message },
        },
      });
    }
  }

  handleContextInvalidation(error) {
    if (!error?.message?.includes('Extension context invalidated')) {
      return false;
    }
    // Unlike a suspended worker, an invalidated content script cannot reconnect.
    // Keep the page transport alive so pending and future RPCs fail explicitly.
    this.contextInvalidated = true;
    this.port = null;
    this.failPending(RELOAD_MESSAGE);
    return true;
  }

  _read() {
    // Incoming messages are pushed by the browser port listener.
  }

  _write(message, _encoding, callback) {
    try {
      if (
        message.name === 'provider' &&
        message.data?.method &&
        message.data.id !== undefined
      ) {
        const { id, method, params } = message.data;
        this.pending.set(id, method);
        if (RELEASING_METHODS.has(method) && typeof params?.[0] === 'string') {
          this.liveIds.delete(params[0].toLowerCase());
        }
      }
      this.open();
      if (this.contextInvalidated) {
        this.failPending(RELOAD_MESSAGE);
        return callback();
      }
      this.port.postMessage(message);
      return callback();
    } catch (error) {
      if (this.handleContextInvalidation(error)) {
        return callback();
      }
      return callback(error);
    }
  }

  _destroy(error, callback) {
    const { port } = this;
    this.port = null;
    this.pending.clear();
    if (port) {
      try {
        port.disconnect();
      } catch (disconnectError) {
        if (!this.handleContextInvalidation(disconnectError)) {
          return callback(error || disconnectError);
        }
      }
    }
    return callback(error);
  }
}
