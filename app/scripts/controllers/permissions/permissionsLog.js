import { CAVEAT_TYPES, HISTORY_STORE_KEY, WALLET_PREFIX } from './enums';

/**
 * Controller with middleware for recording, for each origin, when its
 * eth_accounts permission was last approved and when each account was last
 * exposed to it.
 */
export default class PermissionsLogController {
  constructor({ store }) {
    this.store = store;
  }

  /**
   * Get the permissions history log.
   *
   * @returns {object} The permissions history log.
   */
  getHistory() {
    return this.store.getState()[HISTORY_STORE_KEY] || {};
  }

  /**
   * Update the permissions history log.
   *
   * @param {object} history - The new permissions history log object.
   */
  updateHistory(history) {
    this.store.updateState({ [HISTORY_STORE_KEY]: history });
  }

  /**
   * Updates the exposed account history for the given origin.
   * Sets the 'last seen' time to Date.now() for the given accounts.
   *
   * @param {string} origin - The origin that the accounts are exposed to.
   * @param {Array<string>} accounts - The accounts.
   */
  updateAccountsHistory(origin, accounts) {
    if (accounts.length === 0) {
      return;
    }

    const accountToTimeMap = getAccountToTimeMap(accounts, Date.now());

    this.commitNewHistory(origin, {
      eth_accounts: {
        accounts: accountToTimeMap,
      },
    });
  }

  /**
   * Create a permissions log middleware. Records permissions history: for each
   * origin, the last time eth_accounts was granted, and which accounts were
   * exposed.
   *
   * @returns {Function} The permissions log middleware.
   */
  createMiddleware() {
    return (req, res, next, _end) => {
      const { origin, method } = req;
      const isEthRequestAccounts = method === 'eth_requestAccounts';
      if (
        !isEthRequestAccounts &&
        method !== `${WALLET_PREFIX}requestPermissions`
      ) {
        next();
        return;
      }

      // call next with a return handler for capturing the response
      next((cb) => {
        if (!res.error && res.result) {
          // any permissions or accounts changes will be recorded on the response,
          // so we only log permissions history here
          this.logPermissionsHistory(
            origin,
            res.result,
            Date.now(),
            isEthRequestAccounts,
          );
        }
        cb();
      });
    };
  }

  /**
   * Create a new permissions history log entry, if eth_accounts was granted,
   * and commit it. Only eth_accounts can be requested, and the response
   * includes all of the origin's permissions.
   *
   * @param {string} origin - The origin of the permissions request.
   * @param {Array<object>|Array<string>} result - The permissions request
   * response.result: the granted permissions, or the accounts for
   * eth_requestAccounts.
   * @param {number} time - The time of the response, i.e. Date.now().
   * @param {boolean} isEthRequestAccounts - Whether the permissions request was 'eth_requestAccounts'.
   */
  logPermissionsHistory(origin, result, time, isEthRequestAccounts) {
    let accounts;
    if (isEthRequestAccounts) {
      accounts = result;
    } else {
      const permission = result.find(
        (perm) => perm.parentCapability === 'eth_accounts',
      );
      if (!permission) {
        return;
      }
      accounts = this.getAccountsFromPermission(permission);
    }

    this.commitNewHistory(origin, {
      eth_accounts: {
        accounts: getAccountToTimeMap(accounts, time),
        lastApproved: time,
      },
    });
  }

  /**
   * Commit new entries to the permissions history log.
   * Merges the history for the given origin, overwriting existing entries
   * with the same key (permission name).
   *
   * @param {string} origin - The requesting origin.
   * @param {object} newEntries - The new entries to commit.
   */
  commitNewHistory(origin, newEntries) {
    // a simple merge updates most permissions
    const history = this.getHistory();
    const newOriginHistory = {
      ...history[origin],
      ...newEntries,
    };

    // eth_accounts requires special handling, because of information
    // we store about the accounts
    const existingEthAccountsEntry =
      history[origin] && history[origin].eth_accounts;
    const newEthAccountsEntry = newEntries.eth_accounts;

    if (existingEthAccountsEntry && newEthAccountsEntry) {
      // we may intend to update just the accounts, not the permission
      // itself
      const lastApproved =
        newEthAccountsEntry.lastApproved ||
        existingEthAccountsEntry.lastApproved;

      // merge old and new eth_accounts history entries
      newOriginHistory.eth_accounts = {
        lastApproved,
        accounts: {
          ...existingEthAccountsEntry.accounts,
          ...newEthAccountsEntry.accounts,
        },
      };
    }

    history[origin] = newOriginHistory;

    this.updateHistory(history);
  }

  /**
   * Get the permitted accounts from an eth_accounts permissions object.
   * Returns an empty array if the permission is not eth_accounts.
   *
   * @param {object} perm - The permissions object.
   * @returns {Array<string>} The permitted accounts.
   */
  getAccountsFromPermission(perm) {
    if (perm.parentCapability !== 'eth_accounts' || !perm.caveats) {
      return [];
    }

    const accounts = new Set();
    for (const caveat of perm.caveats) {
      if (
        caveat.type === CAVEAT_TYPES.restrictReturnedAccounts &&
        Array.isArray(caveat.value)
      ) {
        for (const value of caveat.value) {
          accounts.add(value);
        }
      }
    }
    return [...accounts];
  }
}

// helper functions

/**
 * Get a map from account addresses to the given time.
 *
 * @param {Array<string>} accounts - An array of addresses.
 * @param {number} time - A time, e.g. Date.now().
 * @returns {object} A string:number map of addresses to time.
 */
function getAccountToTimeMap(accounts, time) {
  return accounts.reduce((acc, account) => ({ ...acc, [account]: time }), {});
}
