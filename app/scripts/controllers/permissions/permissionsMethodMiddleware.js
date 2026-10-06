import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';

export const MAX_SITE_NAME_LENGTH = 100;
export const MAX_ICON_URL_LENGTH = 2048;
export const MAX_ICON_DATA_URL_LENGTH = 32 * 1024;

/**
 * Keeps the site name and icon a page sends within sizes worth storing. The
 * metadata is persisted with the wallet's state, so a page sending large
 * values, from many subdomains or frames, would otherwise bloat and slow every
 * state write.
 *
 * @param {object} [params] - The request params: the site's name and the
 * URL of its icon.
 * @returns {{name: string, icon?: string} | undefined} The metadata to store,
 * or undefined if there is no usable name.
 */
export function sanitizeDomainMetadata(params) {
  const { name, icon } = params ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return undefined;
  }
  const metadata = { name: name.trim().slice(0, MAX_SITE_NAME_LENGTH) };
  if (typeof icon === 'string') {
    const isWebUrl =
      /^https?:\/\//iu.test(icon) && icon.length <= MAX_ICON_URL_LENGTH;
    const isImageData =
      /^data:image\/[a-z0-9.+-]+[;,]/iu.test(icon) &&
      icon.length <= MAX_ICON_DATA_URL_LENGTH;
    if (isWebUrl || isImageData) {
      metadata.icon = icon;
    }
  }
  return metadata;
}

/**
 * Create middleware for handling certain methods and preprocessing permissions requests.
 *
 * @param {object} options0 - Functions bound to the requesting origin.
 * @param {Function} options0.addDomainMetadata - Stores the site's name and
 * icon.
 * @param {Function} options0.getAccounts - Returns the accounts exposed to the
 * site.
 * @param {Function} options0.getPermissions - Returns the site's permissions.
 * @param {Function} options0.getUnlockPromise - Returns a promise that
 * resolves when the wallet is unlocked.
 * @param {Function} options0.hasPermission - Returns whether the site has the
 * named permission.
 * @param {Function} options0.notifyAccountsChanged - Notifies the site of its
 * exposed accounts.
 * @param {Function} options0.requestAccountsPermission - Asks the user for the
 * eth_accounts permission.
 * @param {Function} options0.requestPermissions - Asks the user to grant the
 * requested permissions.
 * @param {Function} options0.revokePermissions - Revokes the named
 * permissions.
 * @returns {Function} The JSON-RPC middleware.
 */
export default function createPermissionsMethodMiddleware({
  addDomainMetadata,
  getAccounts,
  getPermissions,
  getUnlockPromise,
  hasPermission,
  notifyAccountsChanged,
  requestAccountsPermission,
  requestPermissions,
  revokePermissions,
}) {
  let isProcessingRequestAccounts = false;

  return createAsyncMiddleware(async (req, res, next) => {
    switch (req.method) {
      case 'wallet_getCapabilities': {
        const { params } = req;
        if (
          !Array.isArray(params) ||
          params.length < 1 ||
          params.length > 2 ||
          typeof params[0] !== 'string' ||
          !/^0x[0-9a-f]{40}$/iu.test(params[0]) ||
          (params[1] !== undefined &&
            (!Array.isArray(params[1]) ||
              params[1].some(
                (chainId) =>
                  typeof chainId !== 'string' ||
                  !/^0x(?:0|[1-9a-f][0-9a-f]*)$/iu.test(chainId),
              )))
        ) {
          throw rpcErrors.invalidParams(
            'Expected an account address and an optional array of hexadecimal chain IDs.',
          );
        }
        const accounts = await getAccounts();
        if (
          !accounts.some(
            (account) => account.toLowerCase() === params[0].toLowerCase(),
          )
        ) {
          throw providerErrors.unauthorized();
        }
        // EIP-5792: omitting atomic means batching is not supported. Do not
        // advertise wallet_sendCalls or smart-account features we cannot execute.
        res.result = {};
        return;
      }

      // getAccounts returns an empty array instead of an error (such as
      // 4100: unauthorized) for sites without the eth_accounts permission
      case 'eth_accounts': {
        res.result = await getAccounts();
        return;
      }

      case 'eth_requestAccounts': {
        if (isProcessingRequestAccounts) {
          res.error = rpcErrors.resourceUnavailable(
            'Already processing eth_requestAccounts. Please wait.',
          );
          return;
        }

        if (hasPermission('eth_accounts')) {
          isProcessingRequestAccounts = true;
          await getUnlockPromise();
          isProcessingRequestAccounts = false;
        }

        // first, just try to get accounts
        let accounts = await getAccounts();
        if (accounts.length > 0) {
          res.result = accounts;
          return;
        }

        // if no accounts, request the accounts permission
        try {
          await requestAccountsPermission();
        } catch (err) {
          res.error = err;
          return;
        }

        // get the accounts again
        accounts = await getAccounts();
        /* istanbul ignore else: too hard to induce, see below comment */
        if (accounts.length > 0) {
          res.result = accounts;
        } else {
          // this should never happen, because it should be caught in the
          // above catch clause
          res.error = rpcErrors.internal(
            'Accounts unexpectedly unavailable. Please report this bug.',
          );
        }

        return;
      }

      // the site's name and icon, sent automatically by the inpage provider
      // when it's initialized
      case 'metamask_sendDomainMetadata': {
        const metadata = sanitizeDomainMetadata(req.params);
        if (metadata) {
          addDomainMetadata(req.origin, metadata);
        }
        res.result = true;
        return;
      }

      // EIP-2255. Only eth_accounts can be requested.
      case 'wallet_requestPermissions': {
        const [requested] = Array.isArray(req.params) ? req.params : [];
        if (
          !requested ||
          typeof requested !== 'object' ||
          Array.isArray(requested)
        ) {
          throw rpcErrors.invalidParams({
            message: 'Expected an object of requested permissions.',
            data: req.params,
          });
        }
        res.result = await requestPermissions(requested);
        notifyAccountsChanged(await getAccounts());
        return;
      }

      // A site giving up permissions it holds, such as when it disconnects.
      case 'wallet_revokePermissions': {
        const [revoked] = Array.isArray(req.params) ? req.params : [];
        if (
          !revoked ||
          typeof revoked !== 'object' ||
          Array.isArray(revoked) ||
          Object.keys(revoked).length === 0
        ) {
          throw rpcErrors.invalidParams({
            message: 'Expected a non-empty object of permissions to revoke.',
            data: req.params,
          });
        }
        revokePermissions(Object.keys(revoked));
        res.result = null;
        return;
      }

      case 'wallet_getPermissions': {
        res.result = Object.values(getPermissions() || {});
        return;
      }

      default:
        break;
    }

    await next();
  });
}
