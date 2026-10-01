import { strict as assert } from 'assert'

/**
 * Grants the given permissions to the given origin directly, without a user
 * approval, using the given permissions controller.
 *
 * @param {PermissionsController} permController - The permissions controller.
 * @param {string} origin - The origin to grant permissions to.
 * @param {Object} permissions - The permissions to grant, e.g.
 * { eth_accounts: { caveats: [...] } }.
 */
export function grantPermissions (permController, origin, permissions) {
  permController.permissions.grantPermissions({
    subject: { origin },
    approvedPermissions: permissions,
  })
}

/**
 * Returns a function that starts a permissions request with a known id, as
 * the background does for eth_requestAccounts and wallet_requestPermissions.
 *
 * @param {PermissionsController} permController - The permissions controller.
 * @return {Function} Takes an id and an optional origin; returns the Promise
 * of the request, which settles when the user approves or rejects it.
 */
export function getRequestUserApprovalHelper (permController) {
  return (id, origin = 'https://default.origin') => {
    const request = permController._requestPermissions(
      { origin }, { eth_accounts: {} }, id,
    )
    assert.ok(
      permController.approvals.hasRequest({ id }),
      'request should be pending user approval',
    )
    return request
  }
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
export function getUserApprovalPromise (permController) {
  const { approvals } = permController
  const originalFunction = approvals.addRequest
  return new Promise((resolveHelperPromise) => {
    approvals.addRequest = (...args) => {
      approvals.addRequest = originalFunction
      try {
        return originalFunction.apply(approvals, args)
      } finally {
        // also resolves if the shim refuses the request
        resolveHelperPromise(args[0].id)
      }
    }
  })
}

/**
 * @param {PermissionsController} permController - A permissions controller.
 * @returns {Array<Object>} The pending permissions requests, as shown to the user.
 */
export function getPendingRequests (permController) {
  return permController.approvals.store.getState().permissionsRequests
}

/**
 * Validates an activity log entry with respect to a request, response, and
 * relevant metadata.
 *
 * @param {Object} entry - The activity log entry to validate.
 * @param {Object} req - The request that generated the entry.
 * @param {Object} [res] - The response for the request, if any.
 * @param {'restricted'|'internal'} methodType - The method log controller method type of the request.
 * @param {boolean} success - Whether the request succeeded or not.
 */
export function validateActivityEntry (
  entry, req, res, methodType, success,
) {
  assert.doesNotThrow(
    () => {
      _validateActivityEntry(
        entry, req, res, methodType, success,
      )
    },
    'should have expected activity entry',
  )
}

function _validateActivityEntry (
  entry, req, res, methodType, success,
) {

  assert.ok(entry, 'entry should exist')

  assert.equal(entry.id, req.id)
  assert.equal(entry.method, req.method)
  assert.equal(entry.origin, req.origin)
  assert.equal(entry.methodType, methodType)
  assert.deepEqual(
    entry.request, req,
    'entry.request should equal the request',
  )

  if (res) {

    assert.ok(
      (
        Number.isInteger(entry.requestTime) &&
        Number.isInteger(entry.responseTime)
      ),
      'request and response times should be numbers',
    )
    assert.ok(
      (entry.requestTime <= entry.responseTime),
      'request time should be less than response time',
    )

    assert.equal(entry.success, success)
    assert.deepEqual(
      entry.response, res,
      'entry.response should equal the response',
    )
  } else {

    assert.ok(
      Number.isInteger(entry.requestTime) && entry.requestTime > 0,
      'entry should have non-zero request time',
    )
    assert.ok(
      (
        entry.success === null &&
        entry.responseTime === null &&
        entry.response === null
      ),
      'entry response values should be null',
    )
  }
}
