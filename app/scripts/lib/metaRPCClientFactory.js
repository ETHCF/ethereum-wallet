import { getUniqueId } from '@metamask/json-rpc-engine';
import { JsonRpcError } from '@metamask/rpc-errors';
import { EventEmitter } from 'events';

/**
 * Rebuilds an error the background sent as a plain object.
 *
 * @param {{ message: string, code?: number, data?: any }} error - The error.
 * @returns {Error} The error, as a JsonRpcError when it has a code.
 */
function deserializeApiError({ message, code, data }) {
  return Number.isInteger(code) && message
    ? new JsonRpcError(code, message, data)
    : new Error(message);
}

class MetaRPCClient {
  constructor(connectionStream) {
    this.connectionStream = connectionStream;
    this.notifications = new EventEmitter();
    this.requests = new Map();
    this.connectionStream.on('data', this.handleResponse.bind(this));
    this.connectionStream.on('end', this.close.bind(this));
  }

  /**
   * Subscribes to updates the background pushes. Matches the EventEmitter
   * interface the UI used with dnode, for the 'update' event.
   *
   * @param {string} event - The event; only 'update' is sent.
   * @param {Function} handler - Called with the new state.
   */
  on(event, handler) {
    this.notifications.on(event, handler);
  }

  close() {
    this.notifications.removeAllListeners();
    const closed = new Error('The background connection closed');
    for (const callback of this.requests.values()) {
      callback(closed);
    }
    this.requests.clear();
  }

  handleResponse(data) {
    const { id, result, error, method, params } = data ?? {};
    // The background's only notification is a state update.
    if (id === undefined && method === 'sendUpdate' && Array.isArray(params)) {
      this.notifications.emit('update', params[0]);
      return;
    }
    const callback = this.requests.get(id);
    if (!callback) {
      return;
    }
    this.requests.delete(id);
    if (error) {
      callback(deserializeApiError(error));
    } else {
      callback(null, result);
    }
  }

  request(method, args) {
    const lastArg = args[args.length - 1];
    const callback = typeof lastArg === 'function' ? lastArg : undefined;
    const params = callback ? args.slice(0, -1) : args;
    const id = getUniqueId();
    this.requests.set(
      id,
      callback ??
        ((error) => {
          if (error) {
            throw error;
          }
        }),
    );
    this.connectionStream.write({ jsonrpc: '2.0', id, method, params });
  }
}

/**
 * Connects to the background API over a JSON-RPC stream, as upstream
 * MetaMask does in place of dnode. Any method name becomes a request, called
 * like the background method with a node-style callback last:
 * `background.getState((err, state) => ...)`.
 *
 * @param {import('stream').Duplex} connectionStream - The controller stream.
 * @returns {object} The background API.
 */
export default function metaRPCClientFactory(connectionStream) {
  const client = new MetaRPCClient(connectionStream);
  return new Proxy(client, {
    get(target, property) {
      if (Reflect.has(target, property)) {
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      }
      // Not a thenable, and not an API method: symbols and 'then' are what
      // promise and inspection code look for.
      if (typeof property !== 'string' || property === 'then') {
        return undefined;
      }
      return (...args) => target.request(property, args);
    },
  });
}
