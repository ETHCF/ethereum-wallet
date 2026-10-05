import log from 'loglevel';

/**
 * Returns a middleware that logs RPC activity
 *
 * @param {{ origin: string }} opts - The middleware options
 * @returns {Function} The logger middleware.
 */
export default function createLoggerMiddleware(opts) {
  return function loggerMiddleware(
    /** @type {any} */ req,
    /** @type {any} */ res,
    /** @type {Function} */ next,
  ) {
    next((/** @type {Function} */ cb) => {
      if (res.error) {
        log.error('Error in RPC response:\n', res);
      }
      if (req.isEcfWalletInternal) {
        return;
      }
      log.info(`RPC (${opts.origin}):`, req, '->', res);
      cb();
    });
  };
}
