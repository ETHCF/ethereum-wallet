import {
  JsonRpcEngine,
  createAsyncMiddleware,
} from '@metamask/json-rpc-engine';
import { ObservableStore } from '@metamask/obs-store';
import { rpcErrors } from '@metamask/rpc-errors';
import log from 'loglevel';
import { nanoid } from 'nanoid';

import PermissionApprovals from './approval-shim';
import {
  SAFE_METHODS, // methods that do not require any permissions to use
  WALLET_PREFIX,
  METADATA_STORE_KEY,
  METADATA_CACHE_MAX_SIZE,
  HISTORY_STORE_KEY,
  NOTIFICATION_NAMES,
  CAVEAT_TYPES,
} from './enums';
import PermissionsLogController from './permissionsLog';
import createPermissionsMethodMiddleware from './permissionsMethodMiddleware';
import { createPermissionController } from '../../lib/modern-controllers-implementation';
import { fetchImageAsDataUrl, isImageDataUrl } from '../../lib/remote-image';

export class PermissionsController {
  constructor(
    {
      getKeyringAccounts,
      getUnlockPromise,
      notifyDomain,
      notifyAllDomains,
      preferences,
      showPermissionRequest,
      fetchImage = fetchImageAsDataUrl,
    } = {},
    restoredPermissions = {},
    restoredState = {},
  ) {
    // additional top-level store key set in _initializeMetadataStore
    this.store = new ObservableStore({
      [HISTORY_STORE_KEY]: restoredState[HISTORY_STORE_KEY] || {},
    });

    this.getKeyringAccounts = getKeyringAccounts;
    this._getUnlockPromise = getUnlockPromise;
    this._notifyDomain = notifyDomain;
    this._notifyAllDomains = notifyAllDomains;
    this._showPermissionRequest = showPermissionRequest;
    this._fetchImage = fetchImage;

    this.permissionsLog = new PermissionsLogController({ store: this.store });
    // Pending requests, shown on the connect page.
    this.approvals = new PermissionApprovals({
      showPermissionRequest: () => this._showPermissionRequest(),
    });
    const { controller, store } = createPermissionController({
      state: restoredPermissions,
      approval: this.approvals,
      getAllAccounts: () => this.getKeyringAccounts(),
      getIdentities: () => this._getIdentities(),
      unrestrictedMethods: SAFE_METHODS,
    });
    this.permissions = controller;
    this.permissionStore = store;
    this._lastSelectedAddress = preferences.getState().selectedAddress;
    this.preferences = preferences;

    this._initializeMetadataStore(restoredState);

    preferences.subscribe(async ({ selectedAddress }) => {
      if (selectedAddress && selectedAddress !== this._lastSelectedAddress) {
        this._lastSelectedAddress = selectedAddress;
        await this._handleAccountSelected(selectedAddress);
      }
    });
  }

  createMiddleware({ origin, extensionId }) {
    if (typeof origin !== 'string' || !origin.length) {
      throw new Error('Must provide non-empty string origin.');
    }

    const metadataState = this.store.getState()[METADATA_STORE_KEY];

    if (extensionId && metadataState[origin]?.extensionId !== extensionId) {
      this.addDomainMetadata(origin, { extensionId });
    }

    const engine = new JsonRpcEngine();

    engine.push(this.permissionsLog.createMiddleware());

    engine.push(
      createPermissionsMethodMiddleware({
        addDomainMetadata: this.addDomainMetadata.bind(this),
        getAccounts: this.getAccounts.bind(this, origin),
        getUnlockPromise: () => this._getUnlockPromise(true),
        hasPermission: this.hasPermission.bind(this, origin),
        getPermissions: () => this.permissions.getPermissions(origin),
        notifyAccountsChanged: this.notifyAccountsChanged.bind(this, origin),
        requestPermissions: (permissions) =>
          this._requestPermissions({ origin }, permissions),
        revokePermissions: (permissionNames) =>
          this.removePermissionsFor({ [origin]: permissionNames }),
      }),
    );

    // Every other method either needs no permission or must be permitted.
    engine.push(
      createAsyncMiddleware(async (req, res, next) => {
        if (this.permissions.hasUnrestrictedMethod(req.method)) {
          await next();
          return;
        }
        res.result = await this.permissions.executeRestrictedMethod(
          origin,
          req.method,
          req.params,
        );
      }),
    );

    return engine.asMiddleware();
  }

  /**
   * Request {@code eth_accounts} permissions
   *
   * @param {string} origin - The requesting origin
   * @returns {Promise<string>} The permissions request ID
   */
  async requestAccountsPermissionWithId(origin) {
    const id = nanoid();
    this._requestPermissions({ origin }, { eth_accounts: {} }, id)
      .then(async () =>
        this.notifyAccountsChanged(origin, await this.getAccounts(origin)),
      )
      .catch((error) =>
        log.debug(`Permissions request ${id} did not complete`, error),
      );
    return id;
  }

  /**
   * Returns the accounts that should be exposed for the given origin domain,
   * if any. This method exists for when a trusted context needs to know
   * which accounts are exposed to a given domain.
   *
   * @param {string} origin - The origin string.
   * @returns {Promise<string[]>} The exposed account addresses, or an empty
   * array.
   */
  async getAccounts(origin) {
    if (!this.hasPermission(origin, 'eth_accounts')) {
      return [];
    }
    try {
      const accounts = await this.permissions.executeRestrictedMethod(
        origin,
        'eth_accounts',
      );
      return Array.isArray(accounts) ? accounts : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Returns whether the given origin has the given permission.
   *
   * @param {string} origin - The origin to check.
   * @param {string} permission - The permission to check for.
   * @returns {boolean} Whether the origin has the permission.
   */
  hasPermission(origin, permission) {
    return this.permissions.hasPermission(origin, permission);
  }

  /**
   * Gets the identities from the preferences controller store
   *
   * @returns {object} identities
   */
  _getIdentities() {
    return this.preferences.getState().identities;
  }

  /**
   * Asks the user to grant permissions. Internal, background use only.
   * Only eth_accounts can be requested, and the user chooses its accounts, so
   * any caveats in the request are ignored.
   *
   * @param {object} subject - The requesting origin, as { origin }.
   * @param {string} subject.origin - The origin of the requesting site.
   * @param {object} permissions - The requested permissions.
   * @param {string} [id] - The id of the request. Never taken from the site.
   * @returns {Promise<object[]>} Resolves with the granted permissions, or
   * rejects with an error.
   */
  async _requestPermissions({ origin }, permissions, id = nanoid()) {
    const names = Object.keys(permissions || {});
    if (names.length !== 1 || names[0] !== 'eth_accounts') {
      throw rpcErrors.invalidParams({
        message: 'Only eth_accounts can be requested.',
        data: permissions,
      });
    }
    const [granted] = await this.permissions.requestPermissions(
      { origin },
      { eth_accounts: {} },
      { id },
    );
    return Object.values(granted);
  }

  /**
   * User approval callback. Grants the pending request's permissions with the
   * chosen accounts, resolving the site's request; rejects it if that fails.
   * Idempotent for a given request id.
   *
   * @param {object} approved - The request object approved by the user
   * @param {Array} accounts - The accounts to expose, if any
   */
  async approvePermissionsRequest(approved, accounts) {
    const { id } = approved.metadata;
    const pending = this.approvals.getRequest(id);

    if (!pending) {
      log.debug(`Permissions request with id '${id}' not found`);
      return;
    }

    // Grant only what the site asked for, whatever the UI sent back.
    const permissions = Object.fromEntries(
      Object.entries(pending.permissions).filter(([name]) =>
        Object.prototype.hasOwnProperty.call(approved.permissions || {}, name),
      ),
    );

    try {
      if (Object.keys(permissions).length > 0) {
        this.validatePermittedAccounts(accounts);
      }
      await this.permissions.acceptPermissionsRequest({
        metadata: pending.metadata,
        permissions,
        approvedAccounts: Array.isArray(accounts) ? [...accounts] : [],
      });
    } catch (err) {
      if (this.approvals.hasRequest({ id })) {
        this.approvals.rejectRequest(
          id,
          rpcErrors.invalidRequest({ message: err.message, data: err }),
        );
      }
    }
  }

  /**
   * User rejection callback. Rejects the site's pending request with code 4001.
   * Idempotent for a given id.
   *
   * @param {string} id - The id of the request rejected by the user
   */
  async rejectPermissionsRequest(id) {
    if (!this.approvals.hasRequest({ id })) {
      log.debug(`Permissions request with id '${id}' not found`);
      return;
    }
    await this.permissions.rejectPermissionsRequest(id);
  }

  /**
   * Expose an account to the given origin. Changes the eth_accounts
   * permissions and emits accountsChanged.
   *
   * Throws error if the origin or account is invalid, or if the update fails.
   *
   * @param {string} origin - The origin to expose the account to.
   * @param {string} account - The new account to expose.
   */
  async addPermittedAccount(origin, account) {
    const oldPermittedAccounts = this._getValidatedPermittedAccounts(
      origin,
      account,
    );
    if (oldPermittedAccounts.includes(account)) {
      throw new Error('Account is already permitted for origin');
    }

    this.permissions.updateCaveat(
      origin,
      'eth_accounts',
      CAVEAT_TYPES.restrictReturnedAccounts,
      [...oldPermittedAccounts, account],
    );

    const permittedAccounts = await this.getAccounts(origin);

    this.notifyAccountsChanged(origin, permittedAccounts);
  }

  /**
   * Removes an exposed account from the given origin. Changes the eth_accounts
   * permission and emits accountsChanged.
   * If origin only has a single permitted account, removes the eth_accounts
   * permission from the origin.
   *
   * Throws error if the origin or account is invalid, or if the update fails.
   *
   * @param {string} origin - The origin to remove the account from.
   * @param {string} account - The account to remove.
   */
  async removePermittedAccount(origin, account) {
    const oldPermittedAccounts = this._getValidatedPermittedAccounts(
      origin,
      account,
    );
    if (!oldPermittedAccounts.includes(account)) {
      throw new Error('Account is not permitted for origin');
    }

    let newPermittedAccounts = oldPermittedAccounts.filter(
      (acc) => acc !== account,
    );

    if (newPermittedAccounts.length === 0) {
      this.removePermissionsFor({ [origin]: ['eth_accounts'] });
    } else {
      this.permissions.updateCaveat(
        origin,
        'eth_accounts',
        CAVEAT_TYPES.restrictReturnedAccounts,
        newPermittedAccounts,
      );

      newPermittedAccounts = await this.getAccounts(origin);
    }

    this.notifyAccountsChanged(origin, newPermittedAccounts);
  }

  /**
   * Gets the accounts permitted for an origin, before changing them for the
   * given account. Throws if the origin, the account, or the origin's
   * eth_accounts permission is missing.
   *
   * @param {string} origin - The origin whose accounts to change.
   * @param {string} account - The account to add or remove.
   * @returns {Array<string>} The origin's currently permitted accounts.
   */
  _getValidatedPermittedAccounts(origin, account) {
    if (!this._getSubjects()[origin]) {
      throw new Error('Unrecognized domain');
    }

    this.validatePermittedAccounts([account]);

    const permittedAccounts = this._getPermittedAccounts(origin);
    if (!permittedAccounts) {
      throw new Error(`Origin does not have 'eth_accounts' permission`);
    }
    return permittedAccounts;
  }

  /**
   * Remove all permissions associated with a particular account. Any eth_accounts
   * permissions left with no permitted accounts will be removed as well.
   *
   * Throws error if the account is invalid, or if the update fails.
   *
   * @param {string} account - The account to remove.
   */
  async removeAllAccountPermissions(account) {
    this.validatePermittedAccounts([account]);

    await Promise.all(
      this._originsWithAccount(account).map((origin) =>
        this.removePermittedAccount(origin, account),
      ),
    );
  }

  /**
   * Validate an array of accounts representing accounts to be exposed
   * to a domain. Throws error if validation fails.
   *
   * @param {string[]} accounts - An array of addresses.
   */
  validatePermittedAccounts(accounts) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('Must provide non-empty array of account(s).');
    }

    // assert accounts exist
    const allIdentities = this._getIdentities();
    accounts.forEach((acc) => {
      if (!allIdentities[acc]) {
        throw new Error(`Unknown account: ${acc}`);
      }
    });
  }

  /**
   * Notify a domain that its permitted accounts have changed.
   * Also updates the accounts history log.
   *
   * @param {string} origin - The origin of the domain to notify.
   * @param {Array<string>} newAccounts - The currently permitted accounts.
   */
  notifyAccountsChanged(origin, newAccounts) {
    if (typeof origin !== 'string' || !origin) {
      throw new Error(`Invalid origin: '${origin}'`);
    }

    if (!Array.isArray(newAccounts)) {
      throw new Error('Invalid accounts', newAccounts);
    }

    this._notifyDomain(origin, {
      jsonrpc: '2.0',
      method: NOTIFICATION_NAMES.accountsChanged,
      params: newAccounts,
    });

    // if the accounts changed from the perspective of the dapp,
    // update "last seen" time for the origin and account(s)
    // exception: no accounts -> no times to update
    this.permissionsLog.updateAccountsHistory(origin, newAccounts);

    // NOTE:
    // we don't check for accounts changing in the notifyAllDomains case,
    // because the log only records when accounts were last seen,
    // and the accounts only change for all domains at once when permissions
    // are removed
  }

  /**
   * Removes the given permissions for the given domain.
   * Should only be called after confirming that the permissions exist, to
   * avoid sending unnecessary notifications.
   *
   * @param {object} domains - { origin: [permissions] } - The map of domain
   * origins to permissions to remove.
   */
  removePermissionsFor(domains) {
    Object.entries(domains).forEach(([origin, perms]) => {
      // Unlike rpc-cap, revokePermissions throws for permissions that do not exist.
      const existing = perms.filter((methodName) =>
        this.hasPermission(origin, methodName),
      );
      if (existing.length === 0) {
        return;
      }
      this.permissions.revokePermissions({ [origin]: existing });
      if (existing.includes('eth_accounts')) {
        this.notifyAccountsChanged(origin, []);
      }
    });
  }

  /**
   * Removes all known domains and their related permissions.
   */
  clearPermissions() {
    this.permissions.clearState();
    this._notifyAllDomains({
      jsonrpc: '2.0',
      method: NOTIFICATION_NAMES.accountsChanged,
      params: [],
    });
  }

  /**
   * Stores domain metadata for the given origin (domain).
   * Deletes metadata for domains without permissions in a FIFO manner, once
   * more than 100 distinct origins have been added since boot.
   * Metadata is never deleted for domains with permissions, to prevent a
   * degraded user experience, since metadata cannot yet be requested on demand.
   *
   * @param {string} origin - The origin whose domain metadata to store.
   * @param {object} metadata - The domain's metadata that will be stored.
   */
  addDomainMetadata(origin, metadata) {
    const oldMetadataState = this.store.getState()[METADATA_STORE_KEY];
    const newMetadataState = { ...oldMetadataState };
    const { icon, ...rest } = metadata;
    const iconFields = this._iconFields(oldMetadataState[origin], icon);

    // delete pending metadata origin from queue, and delete its metadata if
    // it doesn't have any permissions
    if (this._pendingSiteMetadata.size >= METADATA_CACHE_MAX_SIZE) {
      const permissionsDomains = this._getSubjects();

      const oldOrigin = this._pendingSiteMetadata.values().next().value;
      this._pendingSiteMetadata.delete(oldOrigin);
      if (!permissionsDomains[oldOrigin]) {
        delete newMetadataState[oldOrigin];
      }
    }

    // add new metadata to store after popping
    newMetadataState[origin] = {
      ...oldMetadataState[origin],
      ...rest,
      ...iconFields,
      lastUpdated: Date.now(),
    };

    if (
      !newMetadataState[origin].extensionId &&
      !newMetadataState[origin].host
    ) {
      newMetadataState[origin].host = new URL(origin).host;
    }

    this._pendingSiteMetadata.add(origin);
    this._setDomainMetadata(newMetadataState);
    if (iconFields.iconSource) {
      this._cacheSiteIcon(origin, iconFields.iconSource).catch(log.error);
    }
  }

  /**
   * Works out how to store a site's icon. The wallet shows site icons only
   * from data URLs, so that showing one asks no host for anything. A remote
   * icon is recorded as its source and downloaded once, unless the icon from
   * that source is already stored.
   *
   * @param {object} [previous] - The site's stored metadata.
   * @param {string} [icon] - The icon the site sent: a data or http(s) URL.
   * @returns {object} The icon fields to store.
   */
  _iconFields(previous, icon) {
    if (icon === undefined) {
      return {};
    }
    if (isImageDataUrl(icon)) {
      return { icon, iconSource: undefined };
    }
    if (previous?.iconSource === icon) {
      return {};
    }
    return { icon: undefined, iconSource: icon };
  }

  /**
   * Downloads a site's icon and stores it as a data URL, if the site has not
   * named another icon meanwhile.
   *
   * @param {string} origin - The site.
   * @param {string} iconSource - The icon's http(s) URL.
   */
  async _cacheSiteIcon(origin, iconSource) {
    const icon = await this._fetchImage(iconSource);
    const metadataState = this.store.getState()[METADATA_STORE_KEY];
    if (!icon || metadataState[origin]?.iconSource !== iconSource) {
      return;
    }
    this._setDomainMetadata({
      ...metadataState,
      [origin]: { ...metadataState[origin], icon },
    });
  }

  /**
   * Removes all domains without permissions from the restored metadata state,
   * and rehydrates the metadata store.
   *
   * Requires PermissionsController._initializePermissions to have been called first.
   *
   * @param {object} restoredState - The restored permissions controller state.
   */
  _initializeMetadataStore(restoredState) {
    const metadataState = restoredState[METADATA_STORE_KEY] || {};
    const newMetadataState = this._trimDomainMetadata(metadataState);

    // Earlier versions stored remote icon URLs. Show no remote icon, and
    // download each of those once. An icon whose download failed is not
    // tried again: a site could fail it on purpose to learn of each start.
    const toCache = [];
    for (const [origin, metadata] of Object.entries(newMetadataState)) {
      if (metadata.icon && !isImageDataUrl(metadata.icon)) {
        const iconSource = metadata.icon;
        newMetadataState[origin] = { ...metadata, icon: undefined, iconSource };
        toCache.push([origin, iconSource]);
      }
    }

    this._pendingSiteMetadata = new Set();
    this._setDomainMetadata(newMetadataState);
    for (const [origin, iconSource] of toCache) {
      this._cacheSiteIcon(origin, iconSource).catch(log.error);
    }
  }

  /**
   * Trims the given metadataState object by removing metadata for all origins
   * without permissions.
   * Returns a new object; does not mutate the argument.
   *
   * @param {object} metadataState - The metadata store state object to trim.
   * @returns {object} The new metadata state object.
   */
  _trimDomainMetadata(metadataState) {
    const newMetadataState = { ...metadataState };
    const origins = Object.keys(metadataState);
    const permissionsDomains = this._getSubjects();

    origins.forEach((origin) => {
      if (!permissionsDomains[origin]) {
        delete newMetadataState[origin];
      }
    });

    return newMetadataState;
  }

  /**
   * Replaces the existing domain metadata with the passed-in object.
   *
   * @param {object} newMetadataState - The new metadata to set.
   */
  _setDomainMetadata(newMetadataState) {
    this.store.updateState({ [METADATA_STORE_KEY]: newMetadataState });
  }

  /**
   * Get current set of permitted accounts for the given origin
   *
   * @param {string} origin - The origin to obtain permitted accounts for
   * @returns {Array<string>|null} The list of permitted accounts
   */
  _getPermittedAccounts(origin) {
    if (!this.hasPermission(origin, 'eth_accounts')) {
      return null;
    }
    const caveat = this.permissions.getCaveat(
      origin,
      'eth_accounts',
      CAVEAT_TYPES.restrictReturnedAccounts,
    );
    return caveat?.value ? [...caveat.value] : null;
  }

  /**
   * Gets the permission subjects.
   *
   * @returns {object} The origins with permissions, by origin.
   */
  _getSubjects() {
    return this.permissions.state.subjects || {};
  }

  /**
   * Returns the origins permitted to see an account.
   *
   * @param {string} account - The account's address.
   * @returns {string[]} The origins.
   */
  _originsWithAccount(account) {
    return Object.keys(this._getSubjects()).filter((origin) =>
      this._getPermittedAccounts(origin)?.includes(account),
    );
  }

  /**
   * When a new account is selected in the UI, emit accountsChanged to each origin
   * where the selected account is exposed.
   *
   * Note: This will emit "false positive" accountsChanged events, but they are
   * handled by the inpage provider.
   *
   * @param {string} account - The newly selected account's address.
   */
  async _handleAccountSelected(account) {
    if (typeof account !== 'string') {
      throw new Error('Selected account should be a non-empty string.');
    }

    await Promise.all(
      this._originsWithAccount(account).map(async (origin) =>
        this.notifyAccountsChanged(origin, await this.getAccounts(origin)),
      ),
    );
  }
}

export function addInternalMethodPrefix(method) {
  return WALLET_PREFIX + method;
}
