import { providerErrors, rpcErrors } from '@metamask/rpc-errors';

/**
 * Site requests waiting for the user to approve or refuse them. Each site
 * may have one pending at a time, so that it cannot queue up prompts, and
 * every request is answered exactly once: with the approved action's result,
 * with its error, or with a user-rejected error.
 */
export default class ApprovalQueue {
  /**
   * Creates an empty queue.
   *
   * @param {object} opts - Options.
   * @param {string} opts.label - What a request is called in errors, such
   * as 'network request'.
   * @param {Function} [opts.onChange] - Called after a request is added or
   * taken, to update what the UI shows.
   */
  constructor({ label, onChange = () => undefined }) {
    this.label = label;
    this.onChange = onChange;
    this._entries = new Map();
  }

  get size() {
    return this._entries.size;
  }

  /**
   * Lists the pending requests as the UI shows them.
   *
   * @returns {Array<object>} The pending requests, oldest first.
   */
  requests() {
    return Array.from(this._entries.values(), ({ request }) => request);
  }

  /**
   * Looks up a pending request without taking it.
   *
   * @param {string} id - A request id.
   * @returns {object|undefined} The pending request's `request` and `data`.
   */
  get(id) {
    const entry = this._entries.get(id);
    return entry && { request: entry.request, data: entry.data };
  }

  /**
   * Throws if the site already has a request pending.
   *
   * @param {string} origin - The site.
   */
  assertNoPendingRequest(origin) {
    if (this.requests().some((request) => request.origin === origin)) {
      throw rpcErrors.resourceUnavailable(
        `A ${this.label} from ${origin} is already pending. Please wait.`,
      );
    }
  }

  /**
   * Adds a request, after checking that its site has none pending.
   *
   * @param {object} request - What the UI shows; needs `id` and `origin`.
   * @param {object} [data] - What only the background needs to act on it.
   * @returns {Promise} Settles with the site's answer.
   */
  add(request, data = {}) {
    this.assertNoPendingRequest(request.origin);
    const result = new Promise((resolve, reject) => {
      this._entries.set(request.id, { request, data, resolve, reject });
    });
    this.onChange();
    return result;
  }

  /**
   * Takes an approved request and answers the site with what `perform`
   * returns, or with its error, which is also thrown to the caller.
   *
   * @param {string} id - The request id.
   * @param {Function} perform - Receives `{ request, data }` and carries out
   * the request.
   * @returns {Promise<void>}
   */
  async approve(id, perform) {
    const { request, data, resolve, reject } = this._take(id);
    try {
      resolve(await perform({ request, data }));
    } catch (error) {
      // The request is already taken, so the site must be answered here.
      reject(error);
      throw error;
    }
  }

  /**
   * Takes a request and refuses it.
   *
   * @param {string} id - The request id.
   * @param {Error} [error] - The site's answer; a user rejection by default.
   */
  reject(id, error = providerErrors.userRejectedRequest()) {
    this._take(id).reject(error);
  }

  /**
   * Refuses every pending request.
   */
  rejectAll() {
    for (const id of [...this._entries.keys()]) {
      this.reject(id);
    }
  }

  _take(id) {
    const entry = this._entries.get(id);
    if (!entry) {
      const label = this.label[0].toUpperCase() + this.label.slice(1);
      throw new Error(`${label} "${id}" not found.`);
    }
    this._entries.delete(id);
    this.onChange();
    return entry;
  }
}
