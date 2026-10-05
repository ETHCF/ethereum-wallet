/**
 * Settles a Node-style callback from a promise. The callback runs on a later
 * task, outside the promise chain, so an error it throws is reported rather
 * than becoming an unhandled rejection.
 *
 * @param {Promise} promise - The promise to wait for
 * @returns {Function} Takes the callback, called with (error) or (null, value)
 */
export default function promiseToCallback (promise) {
  return (callback) => {
    promise.then(
      (value) => setTimeout(callback, 0, null, value),
      (error) => setTimeout(callback, 0, error),
    )
  }
}
