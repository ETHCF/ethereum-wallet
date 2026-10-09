import { strict as assert } from 'assert';

/**
 * @typedef {import('../../../../../app/scripts/controllers/permissions').PermissionsController} PermissionsController
 */

/**
 * Grants the given permissions to the given origin directly, without a user
 * approval, using the given permissions controller.
 *
 * @param {PermissionsController} permController - The permissions controller.
 * @param {string} origin - The origin to grant permissions to.
 * @param {object} permissions - The permissions to grant, e.g.
 * { eth_accounts: { caveats: [...] } }.
 */
export function grantPermissions(permController, origin, permissions) {
  permController.permissions.grantPermissions({
    subject: { origin },
    approvedPermissions: permissions,
  });
}

/**
 * Returns a function that starts a permissions request with a known id, as
 * the background does for eth_requestAccounts and wallet_requestPermissions.
 *
 * @param {PermissionsController} permController - The permissions controller.
 * @returns {Function} Takes an id and an optional origin; returns the Promise
 * of the request, which settles when the user approves or rejects it.
 */
export function getRequestUserApprovalHelper(permController) {
  return (id, origin = 'https://default.origin') => {
    const request = permController._requestPermissions(
      { origin },
      { eth_accounts: {} },
      id,
    );
    assert.ok(
      permController.approvals.hasRequest({ id }),
      'request should be pending user approval',
    );
    return request;
  };
}

/**
 * Returns a Promise that resolves once the next permissions request is pending
 * user approval, with the id of that request.
 *
 * This function must be called on the permissions controller for each request.
 *
 * @param {PermissionsController} permController - A permissions controller.
 * @returns {Promise<string>} Resolves with the request id once a pending
 * approval has been added, or refused by the approvals shim.
 */
export function getUserApprovalPromise(permController) {
  const { approvals } = permController;
  const originalFunction = approvals.addRequest;
  return new Promise((resolveHelperPromise) => {
    approvals.addRequest = (...args) => {
      approvals.addRequest = originalFunction;
      try {
        return originalFunction.apply(approvals, args);
      } finally {
        // also resolves if the shim refuses the request
        resolveHelperPromise(args[0].id);
      }
    };
  });
}

/**
 * Gets the pending permissions requests from the approvals store.
 *
 * @param {PermissionsController} permController - A permissions controller.
 * @returns {Array<object>} The pending permissions requests, as shown to the user.
 */
export function getPendingRequests(permController) {
  return permController.approvals.store.getState().permissionsRequests;
}
