/**
 * Returns a middleware that sets the DApp TabId on the request, replacing
 * any tabId the sender supplied. It is undefined when the sender has no tab.
 *
 * @param {{ tabId: number | undefined }} opts - The middleware options
 * @returns {Function} The tab ID middleware.
 */
export default function createTabIdMiddleware(opts) {
  return function tabIdMiddleware(
    /** @type {any} */ req,
    /** @type {any} */ _,
    /** @type {Function} */ next,
  ) {
    req.tabId = opts.tabId;
    next();
  };
}
