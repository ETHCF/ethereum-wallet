import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';

const CREATE_METHODS = new Set([
  'eth_newFilter',
  'eth_newBlockFilter',
  'eth_newPendingTransactionFilter',
]);

const LOOKUP_METHODS = new Set([
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_uninstallFilter',
]);

/**
 * Returns 16 random bytes as hex, as nodes return filter IDs.
 *
 * @returns {string} The ID
 */
function randomFilterId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Gives a connection's filters random IDs, mapped to the filter middleware's
 * own IDs, which count up from 1 in every connection.
 *
 * Filters live in the background, so a page keeps the IDs of filters that were
 * lost when the background restarted. With counted IDs, a filter made after the
 * restart could answer to an old ID, and the page would read another filter's
 * changes. With random IDs an old ID is unknown, and is answered as a node
 * answers an expired filter: "filter not found" (-32000), which libraries such
 * as viem take as the cue to make the filter again.
 *
 * @param {object} [options] - Options
 * @param {Function} [options.createId] - Makes a new ID
 * @returns {Function} The middleware, placed before the filter middleware
 */
export default function createFilterIdMiddleware({
  createId = randomFilterId,
} = {}) {
  const filterIds = new Map();

  return createAsyncMiddleware(async (req, res, next) => {
    if (CREATE_METHODS.has(req.method)) {
      await next();
      if (typeof res.result === 'string') {
        const id = createId();
        filterIds.set(id, res.result);
        res.result = id;
      }
      return;
    }
    if (!LOOKUP_METHODS.has(req.method)) {
      await next();
      return;
    }

    const [id, ...rest] = Array.isArray(req.params) ? req.params : [];
    const key = typeof id === 'string' ? id.toLowerCase() : undefined;
    if (!filterIds.has(key)) {
      if (req.method === 'eth_uninstallFilter') {
        // As a node answers: there was nothing to remove.
        res.result = false;
        return;
      }
      throw rpcErrors.invalidInput({ message: 'filter not found' });
    }
    req.params = [filterIds.get(key), ...rest];
    await next();
    if (req.method === 'eth_uninstallFilter') {
      filterIds.delete(key);
    }
  });
}
