import { rpcErrors } from '@metamask/rpc-errors';
import log from 'loglevel';

/**
 * Copies the parts of an error the UI uses into a plain object that survives
 * a port. An Error's message is not enumerable, so it would otherwise be lost.
 *
 * @param {Error} error - The error an API method failed with.
 * @returns {{ message: string, code?: number, data?: any }} The plain error.
 */
export function serializeApiError(error) {
  const serialized = { message: String(error?.message ?? error) };
  if (Number.isInteger(error?.code)) {
    serialized.code = error.code;
  }
  if (error?.data !== undefined) {
    try {
      serialized.data = JSON.parse(JSON.stringify(error.data));
    } catch (_) {
      // Data that cannot be serialized is left out rather than failing the reply.
    }
  }
  return serialized;
}

/**
 * Serves the background API to a wallet UI over a JSON-RPC stream, as
 * upstream MetaMask does in place of dnode. Each request names an API method;
 * its params are passed with a node-style callback, and the result or error is
 * written back with the request's id.
 *
 * @param {object} api - The API object from EcfWalletController#getApi.
 * @param {import('stream').Duplex} outStream - The controller stream.
 * @returns {Function} A 'data' listener for the stream.
 */
export default function createMetaRPCHandler(api, outStream) {
  const isClosed = () => outStream.destroyed || outStream.writableEnded;
  const reply = (message) => {
    if (!isClosed()) {
      outStream.write({ jsonrpc: '2.0', ...message });
    }
  };

  return (data) => {
    const { id, method, params } = data ?? {};
    // Only requests are answered; the UI sends nothing else.
    if (id === undefined || id === null) {
      return;
    }
    if (
      typeof method !== 'string' ||
      !Object.hasOwn(api, method) ||
      typeof api[method] !== 'function'
    ) {
      reply({
        id,
        error: serializeApiError(
          rpcErrors.methodNotFound({ message: `${String(method)} not found` }),
        ),
      });
      return;
    }
    if (!Array.isArray(params)) {
      reply({
        id,
        error: serializeApiError(
          rpcErrors.invalidParams({ message: 'params must be an array' }),
        ),
      });
      return;
    }
    try {
      api[method](...params, (error, result) => {
        if (isClosed()) {
          if (error) {
            log.error(error);
          }
          return;
        }
        if (error) {
          reply({ id, error: serializeApiError(error) });
        } else {
          reply({ id, result });
        }
      });
    } catch (error) {
      reply({ id, error: serializeApiError(error) });
    }
  };
}
