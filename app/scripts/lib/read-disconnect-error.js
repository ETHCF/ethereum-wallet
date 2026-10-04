/**
 * Reads the error a port disconnected with. Chrome reports an expected
 * disconnect, such as the page entering the back/forward cache, as an
 * unchecked runtime.lastError unless a disconnect listener reads it. Every
 * onDisconnect listener should call this.
 *
 * @param {Object} port - The disconnected port
 * @returns {Object|undefined} The error, if any
 */
export default function readDisconnectError (port) {
  return globalThis.chrome?.runtime?.lastError || port.error
}
