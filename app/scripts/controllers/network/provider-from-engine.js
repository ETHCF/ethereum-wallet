import { getUniqueId } from '@metamask/json-rpc-engine';
import { JsonRpcError } from '@metamask/rpc-errors';
import SafeEventEmitter from '@metamask/safe-event-emitter';

/**
 * Wraps a JSON-RPC engine as a provider. Unlike the provider in
 * `@metamask/eth-json-rpc-provider`, it passes each request on whole, so
 * middleware still sees fields such as `origin` that callers attach.
 *
 * @param {object} engine - A JsonRpcEngine
 * @returns {object} A provider with sendAsync, send and request methods
 */
export default function providerFromEngine(engine) {
  const provider = new SafeEventEmitter();
  provider.sendAsync = engine.handle.bind(engine);
  provider.send = (req, callback) => {
    if (!callback) {
      throw new Error('Web3 Provider - must provide callback to "send" method');
    }
    engine.handle(req, callback);
  };
  // Keeps any extra fields, such as the origin providerAsMiddleware passes on.
  provider.request = async (request) => {
    const res = await engine.handle({
      id: getUniqueId(),
      jsonrpc: '2.0',
      ...request,
    });
    if (res.error) {
      // The engine serializes errors; rethrow one that serializes the same
      // way. serializeError() passes a plain Error with these fields through
      // unchanged, and its message, not being enumerable, is then lost when
      // the response crosses to the page as JSON.
      const { code, message, data, stack } = res.error;
      const error =
        Number.isInteger(code) && message
          ? new JsonRpcError(code, message, data)
          : new JsonRpcError(
              -32603,
              message || 'Internal JSON-RPC error.',
              res.error,
            );
      throw Object.assign(error, stack ? { stack } : {});
    }
    return res.result;
  };
  // forward notifications
  if (engine.on) {
    engine.on('notification', (message) => {
      provider.emit('data', null, message);
    });
  }
  return provider;
}
