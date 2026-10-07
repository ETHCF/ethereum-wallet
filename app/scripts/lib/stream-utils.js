import ObjectMultiplex from '@metamask/object-multiplex';
import pump from 'pump';

/**
 * Whether a stream pipeline failed only because the other end went away, as
 * when a popup or a site's tab closes. That is a normal disconnect, not an error.
 *
 * @param {Error | undefined} error - The pipeline's error, if any
 * @returns {boolean} True for a premature close
 */
export function isPrematureClose(error) {
  return /premature close/iu.test(error?.message ?? '');
}

/**
 * Sets up stream multiplexing for the given stream
 *
 * @param {any} connectionStream - the stream to mux
 * @returns {ObjectMultiplex} the multiplexed stream
 */
export function setupMultiplex(connectionStream) {
  const mux = new ObjectMultiplex();
  pump(connectionStream, mux, connectionStream, (err) => {
    if (err && !isPrematureClose(err)) {
      console.error(err);
    }
  });
  return mux;
}
