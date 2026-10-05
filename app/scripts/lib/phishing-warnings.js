/**
 * The name of the port phishing.html opens when the user chooses to continue
 * to the site it warns about.
 */
export const PHISHING_WARNING_CONTINUE = 'phishing-warning-continue';

/**
 * The sites tabs were sent away from by the phishing warning, so that
 * continuing from the warning goes back to the site the wallet flagged and
 * nothing else. The page itself is given nothing it could be tricked into
 * passing back. Kept in session storage, which outlives the service worker.
 */
export default class PhishingWarnings {
  /**
   * Keeps warnings in the given storage area.
   *
   * @param {object} storage - A storage area with promise-returning get, set
   * and remove, such as browser.storage.session
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Records the site a tab was flagged for.
   *
   * @param {number} tabId - The tab showing the warning
   * @param {object} warning - What it warns about
   * @param {string} warning.hostname - The flagged hostname
   * @param {string} warning.href - Where continuing goes
   */
  async set(tabId, { hostname, href }) {
    await this.storage.set({ [key(tabId)]: { hostname, href } });
  }

  /**
   * Removes and returns the site a tab was flagged for.
   *
   * @param {number} tabId - The tab showing the warning
   * @returns {Promise<{hostname: string, href: string}|undefined>} The warning,
   * if the tab has one
   */
  async take(tabId) {
    const { [key(tabId)]: warning } = await this.storage.get(key(tabId));
    await this.storage.remove(key(tabId));
    return warning;
  }
}

function key(tabId) {
  return `phishingWarning:${tabId}`;
}
