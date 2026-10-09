import { JsonRpcError } from '@metamask/rpc-errors';

/**
 * Rebuilds a JSON-RPC error that crossed a stream or an engine as a plain
 * object. serializeError() passes a plain Error with these fields through
 * unchanged, and its message, not being enumerable, is then lost when the
 * error is serialized again.
 *
 * @param {object} serialized - The serialized error.
 * @param {number} serialized.code - The JSON-RPC error code.
 * @param {string} serialized.message - The error message.
 * @param {any} [serialized.data] - Any data sent with the error.
 * @returns {JsonRpcError | undefined} The error, or undefined if it has no
 * integer code and message.
 */
export default function deserializeRpcError({ code, message, data }) {
  return Number.isInteger(code) && message
    ? new JsonRpcError(code, message, data)
    : undefined;
}
