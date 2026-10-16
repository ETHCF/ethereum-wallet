import { strict as assert } from 'assert';
import sinon from 'sinon';

import {
  getPendingRequests,
  getUserApprovalPromise,
  grantPermissions,
} from './helpers';
import {
  constants,
  getters,
  getPermControllerOpts,
  getPermissionsMiddleware,
} from './mocks';
import { PermissionsController } from '../../../../../app/scripts/controllers/permissions';
import { METADATA_STORE_KEY } from '../../../../../app/scripts/controllers/permissions/enums';
import {
  MAX_ICON_DATA_URL_LENGTH,
  MAX_SITE_NAME_LENGTH,
} from '../../../../../app/scripts/controllers/permissions/permissionsMethodMiddleware';

const { CAVEATS, ERRORS, PERMS, RPC_REQUESTS } = getters;

const { ACCOUNTS, DOMAINS, PERM_NAMES } = constants;

const validatePermission = (perm, name, origin, caveats) => {
  assert.equal(
    name,
    perm.parentCapability,
    'should have expected permission name',
  );
  assert.equal(origin, perm.invoker, 'should have expected permission origin');
  assert.deepEqual(
    caveats,
    perm.caveats,
    'should have expected permission caveats',
  );
  assert.ok(typeof perm.id === 'string' && perm.id, 'should have an id');
  assert.ok(Number.isInteger(perm.date), 'should have a date');
};

const initPermController = () => {
  return new PermissionsController({
    ...getPermControllerOpts(),
  });
};

describe('permissions middleware', function () {
  describe('wallet_getCapabilities', function () {
    let permController;
    let middleware;

    beforeEach(function () {
      permController = initPermController();
      grantPermissions(
        permController,
        DOMAINS.a.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.a.permitted),
      );
      middleware = getPermissionsMiddleware(permController, DOMAINS.a.origin);
    });

    it('returns no batching capabilities for a connected account without forwarding to RPC', async function () {
      const next = sinon.spy();
      const res = {};
      await middleware(
        { method: 'wallet_getCapabilities', params: [ACCOUNTS.a.primary] },
        res,
        next,
      );
      assert.deepEqual(res.result, {});
      assert.ok(next.notCalled);
      assert.equal(getPendingRequests(permController).length, 0);
    });

    it('accepts checksummed accounts and omits unsupported chains', async function () {
      const res = {};
      await middleware(
        {
          method: 'wallet_getCapabilities',
          params: [
            ACCOUNTS.a.primary.toUpperCase().replace('0X', '0x'),
            ['0x1', '0x2105'],
          ],
        },
        res,
      );
      assert.deepEqual(res.result, {});
    });

    it('requires account permission for the requesting origin', async function () {
      const otherOrigin = getPermissionsMiddleware(
        permController,
        DOMAINS.b.origin,
      );
      await assert.rejects(
        otherOrigin({
          method: 'wallet_getCapabilities',
          params: [ACCOUNTS.a.primary],
        }),
        { code: 4100 },
      );
    });

    it('does not expose capabilities for an unconnected account', async function () {
      await assert.rejects(
        middleware({
          method: 'wallet_getCapabilities',
          params: ['0x0000000000000000000000000000000000000001'],
        }),
        { code: 4100 },
      );
    });

    it('rejects malformed parameters', async function () {
      const invalidParams = [
        undefined,
        {},
        [],
        ['bad-address'],
        [ACCOUNTS.a.primary, '0x1'],
        [ACCOUNTS.a.primary, ['0x01']],
        [ACCOUNTS.a.primary, ['1']],
        [ACCOUNTS.a.primary, [1]],
        [ACCOUNTS.a.primary, [], true],
      ];
      for (const params of invalidParams) {
        await assert.rejects(
          middleware({ method: 'wallet_getCapabilities', params }),
          { code: -32602 },
        );
      }
    });
  });

  describe('wallet_requestPermissions', function () {
    let permController;

    beforeEach(function () {
      permController = initPermController();
      permController.notifyAccountsChanged = sinon.fake();
    });

    it('grants permissions on user approval', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {};

      const userApprovalPromise = getUserApprovalPromise(permController);

      const pendingApproval = assert.doesNotReject(
        aMiddleware(req, res),
        'should not reject permissions request',
      );

      const id = await userApprovalPromise;

      assert.deepEqual(
        getPendingRequests(permController),
        [
          {
            metadata: { id, origin: DOMAINS.a.origin },
            permissions: PERMS.requests.eth_accounts(),
          },
        ],
        'perm controller should have single pending approval',
      );

      const approvedReq = PERMS.approvedRequest(
        id,
        PERMS.requests.eth_accounts(),
      );

      await permController.approvePermissionsRequest(
        approvedReq,
        ACCOUNTS.a.permitted,
      );
      await pendingApproval;

      assert.ok(
        res.result && !res.error,
        'response should have result and no error',
      );

      assert.equal(
        res.result.length,
        1,
        'origin should have single approved permission',
      );

      validatePermission(
        res.result[0],
        PERM_NAMES.eth_accounts,
        DOMAINS.a.origin,
        CAVEATS.eth_accounts(ACCOUNTS.a.permitted),
      );

      const aAccounts = await permController.getAccounts(DOMAINS.a.origin);
      assert.deepEqual(
        aAccounts,
        [ACCOUNTS.a.primary],
        'origin should have correct accounts',
      );

      assert.ok(
        permController.notifyAccountsChanged.calledOnceWith(
          DOMAINS.a.origin,
          aAccounts,
        ),
        'expected notification call should have been made',
      );

      assert.equal(
        getPendingRequests(permController).length,
        0,
        'perm controller should have no pending approvals',
      );

      // the permissions log reads the granted accounts off the response
      const history = permController.permissionsLog.getHistory();
      assert.deepEqual(
        Object.keys(history[DOMAINS.a.origin].eth_accounts.accounts),
        ACCOUNTS.a.permitted,
        'permissions history should have the approved accounts',
      );
    });

    it("generates the request id instead of using the request's id", async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      const bMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.b.origin,
      );

      const dappId = 'dapp-chosen-id';

      const reqA = {
        ...RPC_REQUESTS.requestPermission(
          DOMAINS.a.origin,
          PERM_NAMES.eth_accounts,
        ),
        id: dappId,
      };
      const resA = {};

      let userApprovalPromise = getUserApprovalPromise(permController);
      const pendingApprovalA = aMiddleware(reqA, resA);
      const idA = await userApprovalPromise;

      assert.ok(
        typeof idA === 'string' && idA && idA !== dappId,
        'request id should be generated by the wallet',
      );

      // another site cannot collide with, or guess, the pending request id
      const reqB = {
        ...RPC_REQUESTS.requestPermission(
          DOMAINS.b.origin,
          PERM_NAMES.eth_accounts,
        ),
        id: dappId,
      };
      const resB = {};

      userApprovalPromise = getUserApprovalPromise(permController);
      const pendingApprovalB = bMiddleware(reqB, resB);
      const idB = await userApprovalPromise;

      assert.ok(idB !== dappId && idB !== idA, 'request ids should be unique');
      assert.deepEqual(
        getPendingRequests(permController).map(({ metadata }) => metadata),
        [
          { id: idA, origin: DOMAINS.a.origin },
          { id: idB, origin: DOMAINS.b.origin },
        ],
        'should have both pending requests',
      );

      // approving by the dapp's id does nothing
      await permController.approvePermissionsRequest(
        PERMS.approvedRequest(dappId, PERMS.requests.eth_accounts()),
        ACCOUNTS.a.permitted,
      );
      assert.equal(
        getPendingRequests(permController).length,
        2,
        'requests should still be pending',
      );

      await permController.approvePermissionsRequest(
        PERMS.approvedRequest(idA, PERMS.requests.eth_accounts()),
        ACCOUNTS.a.permitted,
      );
      await permController.rejectPermissionsRequest(idB);

      await assert.doesNotReject(pendingApprovalA);
      await assert.rejects(
        pendingApprovalB,
        ERRORS.rejectPermissionsRequest.rejection(),
      );

      assert.deepEqual(
        permController.permissions.getSubjectNames(),
        [DOMAINS.a.origin],
        'only the approved origin should have permissions',
      );
    });

    it('handles serial approved requests that overwrite existing permissions', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      // create first request

      const req1 = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res1 = {};

      // send, approve, and validate first request
      // note use of ACCOUNTS.a.permitted

      let userApprovalPromise = getUserApprovalPromise(permController);

      const pendingApproval1 = assert.doesNotReject(
        aMiddleware(req1, res1),
        'should not reject permissions request',
      );

      const id1 = await userApprovalPromise;
      const approvedReq1 = PERMS.approvedRequest(
        id1,
        PERMS.requests.eth_accounts(),
      );

      await permController.approvePermissionsRequest(
        approvedReq1,
        ACCOUNTS.a.permitted,
      );
      await pendingApproval1;

      assert.ok(
        res1.result && !res1.error,
        'response should have result and no error',
      );

      assert.equal(
        res1.result.length,
        1,
        'origin should have single approved permission',
      );

      validatePermission(
        res1.result[0],
        PERM_NAMES.eth_accounts,
        DOMAINS.a.origin,
        CAVEATS.eth_accounts(ACCOUNTS.a.permitted),
      );

      const accounts1 = await permController.getAccounts(DOMAINS.a.origin);
      assert.deepEqual(
        accounts1,
        [ACCOUNTS.a.primary],
        'origin should have correct accounts',
      );

      assert.ok(
        permController.notifyAccountsChanged.calledOnceWith(
          DOMAINS.a.origin,
          accounts1,
        ),
        'expected notification call should have been made',
      );

      // create second request

      const req2 = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res2 = {};

      // send, approve, and validate second request
      // note use of ACCOUNTS.c.permitted

      userApprovalPromise = getUserApprovalPromise(permController);

      const pendingApproval2 = assert.doesNotReject(
        aMiddleware(req2, res2),
        'should not reject permissions request',
      );

      const id2 = await userApprovalPromise;
      assert.notEqual(id1, id2, 'request ids should differ');
      const approvedReq2 = PERMS.approvedRequest(
        id2,
        PERMS.requests.eth_accounts(),
      );

      await permController.approvePermissionsRequest(
        approvedReq2,
        ACCOUNTS.c.permitted,
      );
      await pendingApproval2;

      assert.ok(
        res2.result && !res2.error,
        'response should have result and no error',
      );

      assert.equal(
        res2.result.length,
        1,
        'origin should have single approved permission',
      );

      validatePermission(
        res2.result[0],
        PERM_NAMES.eth_accounts,
        DOMAINS.a.origin,
        CAVEATS.eth_accounts(ACCOUNTS.c.permitted),
      );

      const accounts2 = await permController.getAccounts(DOMAINS.a.origin);
      assert.deepEqual(
        accounts2,
        [ACCOUNTS.c.primary],
        'origin should have correct accounts',
      );
      assert.deepEqual(
        permController._getPermittedAccounts(DOMAINS.a.origin),
        ACCOUNTS.c.permitted,
        'old permitted accounts should have been overwritten',
      );

      assert.equal(
        permController.notifyAccountsChanged.callCount,
        2,
        'should have called notification method 2 times in total',
      );

      assert.ok(
        permController.notifyAccountsChanged.lastCall.calledWith(
          DOMAINS.a.origin,
          accounts2,
        ),
        'expected notification call should have been made',
      );
    });

    it('rejects permissions on user rejection, with code 4001', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {};

      const expectedError = ERRORS.rejectPermissionsRequest.rejection();

      const userApprovalPromise = getUserApprovalPromise(permController);

      const requestRejection = assert.rejects(
        aMiddleware(req, res),
        expectedError,
        'request should be rejected with correct error',
      );

      const id = await userApprovalPromise;

      assert.equal(
        getPendingRequests(permController).length,
        1,
        'perm controller should have single pending approval',
      );

      await permController.rejectPermissionsRequest(id);
      await requestRejection;

      assert.ok(
        !res.result &&
          res.error &&
          res.error.message === expectedError.message &&
          res.error.code === 4001,
        'response should have expected error and no result',
      );

      const aAccounts = await permController.getAccounts(DOMAINS.a.origin);
      assert.deepEqual(
        aAccounts,
        [],
        'origin should have have correct accounts',
      );

      assert.ok(
        permController.notifyAccountsChanged.notCalled,
        'should not have called notification method',
      );
    });

    it('rejects requests with unknown permissions', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const expectedError = ERRORS.requestPermissions.onlyEthAccounts();

      for (const permissions of [
        PERMS.requests.does_not_exist(),
        {
          ...PERMS.requests.eth_accounts(),
          ...PERMS.requests.does_not_exist(),
        },
      ]) {
        const req = RPC_REQUESTS.requestPermissions(
          DOMAINS.a.origin,
          permissions,
        );
        const res = {};

        await assert.rejects(
          aMiddleware(req, res),
          expectedError,
          'request should be rejected with correct error',
        );

        assert.ok(
          !res.result &&
            res.error &&
            res.error.message === expectedError.message,
          'response should have expected error and no result',
        );
      }

      assert.equal(
        getPendingRequests(permController).length,
        0,
        'perm controller should have no pending approvals',
      );

      assert.ok(
        permController.notifyAccountsChanged.notCalled,
        'should not have called notification method',
      );
    });

    it('rejects malformed requests', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      for (const params of [undefined, [], [null], [[]], ['eth_accounts']]) {
        await assert.rejects(
          aMiddleware(
            {
              origin: DOMAINS.a.origin,
              method: 'wallet_requestPermissions',
              params,
            },
            {},
          ),
          { code: -32602 },
          'request should be rejected with invalid params error',
        );
      }

      assert.equal(
        getPendingRequests(permController).length,
        0,
        'perm controller should have no pending approvals',
      );
    });

    it('accepts only a single pending permissions request per origin', async function () {
      const expectedError = ERRORS.approvals.requestAlreadyPending();

      // two middlewares for two origins

      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      const bMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.b.origin,
      );

      // create and start processing first request for first origin

      const reqA1 = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const resA1 = {};

      let userApprovalPromise = getUserApprovalPromise(permController);

      const requestApproval1 = assert.doesNotReject(
        aMiddleware(reqA1, resA1),
        'should not reject permissions request',
      );

      await userApprovalPromise;

      // create and start processing first request for second origin

      const reqB1 = RPC_REQUESTS.requestPermission(
        DOMAINS.b.origin,
        PERM_NAMES.eth_accounts,
      );
      const resB1 = {};

      userApprovalPromise = getUserApprovalPromise(permController);

      const requestApproval2 = assert.doesNotReject(
        bMiddleware(reqB1, resB1),
        'should not reject permissions request',
      );

      await userApprovalPromise;

      assert.equal(
        getPendingRequests(permController).length,
        2,
        'perm controller should have expected number of pending approvals',
      );

      // create and start processing second request for first origin,
      // which should throw

      const reqA2 = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const resA2 = {};

      userApprovalPromise = getUserApprovalPromise(permController);

      const requestApprovalFail = assert.rejects(
        aMiddleware(reqA2, resA2),
        expectedError,
        'request should be rejected with correct error',
      );

      await userApprovalPromise;
      await requestApprovalFail;

      assert.ok(
        !resA2.result &&
          resA2.error &&
          resA2.error.message === expectedError.message,
        'response should have expected error and no result',
      );

      // first requests for both origins should remain

      assert.equal(
        getPendingRequests(permController).length,
        2,
        'perm controller should have expected number of pending approvals',
      );

      // now, remaining pending requests should be approved without issue

      for (const {
        metadata: { id },
      } of getPendingRequests(permController)) {
        await permController.approvePermissionsRequest(
          PERMS.approvedRequest(id, PERMS.requests.eth_accounts()),
          ACCOUNTS.b.permitted,
        );
      }
      await requestApproval1;
      await requestApproval2;

      assert.ok(
        resA1.result && !resA1.error,
        'first response should have result and no error',
      );
      assert.equal(
        resA1.result.length,
        1,
        'first origin should have single approved permission',
      );

      assert.ok(
        resB1.result && !resB1.error,
        'second response should have result and no error',
      );
      assert.equal(
        resB1.result.length,
        1,
        'second origin should have single approved permission',
      );

      assert.equal(
        getPendingRequests(permController).length,
        0,
        'perm controller should have expected number of pending approvals',
      );
    });
  });

  describe('wallet_revokePermissions', function () {
    it("revokes the site's own accounts permission", async function () {
      const permController = initPermController();
      grantPermissions(
        permController,
        DOMAINS.a.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.a.permitted),
      );
      grantPermissions(
        permController,
        DOMAINS.b.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.b.permitted),
      );
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      const res = {};

      await aMiddleware(
        RPC_REQUESTS.custom(DOMAINS.a.origin, 'wallet_revokePermissions', [
          { eth_accounts: {} },
        ]),
        res,
      );

      assert.equal(res.result, null);
      assert.equal(
        permController.hasPermission(DOMAINS.a.origin, 'eth_accounts'),
        false,
      );
      assert.equal(
        permController.hasPermission(DOMAINS.b.origin, 'eth_accounts'),
        true,
        'other sites keep theirs',
      );
    });

    it('rejects an empty request', async function () {
      const permController = initPermController();
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      await assert.rejects(
        aMiddleware(
          RPC_REQUESTS.custom(DOMAINS.a.origin, 'wallet_revokePermissions', [
            {},
          ]),
          {},
        ),
        (error) => error.code === -32602,
      );
    });
  });

  describe('wallet_getPermissions', function () {
    let permController;

    beforeEach(function () {
      permController = initPermController();
    });

    it('returns no permissions for unpermitted domain', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      const next = sinon.spy();
      const res = {};

      await aMiddleware(
        RPC_REQUESTS.custom(DOMAINS.a.origin, 'wallet_getPermissions'),
        res,
        next,
      );

      assert.deepEqual(res.result, [], 'should return no permissions');
      assert.ok(next.notCalled, 'should not forward the request');
    });

    it('returns the granted eth_accounts permission', async function () {
      grantPermissions(
        permController,
        DOMAINS.a.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.a.permitted),
      );
      grantPermissions(
        permController,
        DOMAINS.b.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.b.permitted),
      );

      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      const res = {};

      await aMiddleware(
        RPC_REQUESTS.custom(DOMAINS.a.origin, 'wallet_getPermissions'),
        res,
      );

      assert.equal(res.result.length, 1, 'should return single permission');
      validatePermission(
        res.result[0],
        PERM_NAMES.eth_accounts,
        DOMAINS.a.origin,
        CAVEATS.eth_accounts(ACCOUNTS.a.permitted),
      );
      assert.deepEqual(
        res.result[0],
        permController.permissions.getPermission(
          DOMAINS.a.origin,
          PERM_NAMES.eth_accounts,
        ),
        'should return the stored permission',
      );
    });
  });

  describe('restricted methods', function () {
    let permController;

    beforeEach(function () {
      permController = initPermController();
    });

    it('prevents restricted method access for unpermitted domain', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const req = RPC_REQUESTS.eth_accounts(DOMAINS.a.origin);
      const res = {};

      // eth_accounts is answered with no accounts rather than an error, for
      // backwards compatibility
      await aMiddleware(req, res);
      assert.deepEqual(res.result, [], 'should return no accounts');

      // the restricted method itself is unauthorized
      await assert.rejects(
        permController.permissions.executeRestrictedMethod(
          DOMAINS.a.origin,
          'eth_accounts',
        ),
        ERRORS.permissionController.unauthorized(),
        'should be rejected with unauthorized error',
      );
    });

    it('allows restricted method access for permitted domain', async function () {
      const bMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.b.origin,
      );

      grantPermissions(
        permController,
        DOMAINS.b.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.a.permitted),
      );

      const req = RPC_REQUESTS.eth_accounts(DOMAINS.b.origin);
      const res = {};

      await assert.doesNotReject(bMiddleware(req, res), 'should not reject');

      assert.deepEqual(
        res.result,
        [ACCOUNTS.a.primary],
        'response should have correct result',
      );
      assert.deepEqual(
        await permController.permissions.executeRestrictedMethod(
          DOMAINS.b.origin,
          'eth_accounts',
        ),
        [ACCOUNTS.a.primary],
        'restricted method should return primary account',
      );
    });

    it('rejects unknown methods with method not found', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );
      grantPermissions(
        permController,
        DOMAINS.a.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.a.permitted),
      );

      const next = sinon.spy();
      const res = {};

      await assert.rejects(
        aMiddleware(
          RPC_REQUESTS.custom(DOMAINS.a.origin, PERM_NAMES.does_not_exist),
          res,
          next,
        ),
        ERRORS.permissionController.methodNotFound(),
        'should be rejected with method not found error',
      );
      assert.ok(next.notCalled, 'should not forward the request');
      assert.ok(
        !res.result && res.error,
        'response should have error and no result',
      );
    });

    it('passes unrestricted methods to the next middleware', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      for (const method of [
        'eth_blockNumber',
        'eth_sendTransaction',
        'personal_sign',
        'eth_blobBaseFee',
        'eth_getBlockReceipts',
        'eth_createAccessList',
        'eth_simulateV1',
      ]) {
        const res = {};
        let forwarded = false;
        await new Promise((resolve, reject) => {
          aMiddleware(
            RPC_REQUESTS.custom(DOMAINS.a.origin, method),
            res,
            (returnHandler) => {
              forwarded = true;
              returnHandler(resolve);
            },
            reject,
          );
        });
        assert.ok(forwarded, `${method} should be forwarded`);
        assert.ok(!res.error, `${method} should have no error`);
      }
    });

    it('does not forward proof-of-work methods or eth_signTypedData_v1 to the node', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      for (const method of [
        'eth_getWork',
        'eth_submitWork',
        'eth_submitHashrate',
        'eth_hashrate',
        'eth_mining',
        'eth_protocolVersion',
        'eth_signTypedData_v1',
      ]) {
        const next = sinon.spy();
        await assert.rejects(
          aMiddleware(RPC_REQUESTS.custom(DOMAINS.a.origin, method), {}, next),
          ERRORS.permissionController.methodNotFound(),
          `${method} should be rejected with method not found`,
        );
        assert.ok(next.notCalled, `${method} should not be forwarded`);
      }
    });
  });

  describe('eth_accounts', function () {
    let permController;

    beforeEach(function () {
      permController = initPermController();
    });

    it('returns empty array for non-permitted domain', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const req = RPC_REQUESTS.eth_accounts(DOMAINS.a.origin);
      const res = {};

      await assert.doesNotReject(aMiddleware(req, res), 'should not reject');

      assert.ok(
        res.result && !res.error,
        'response should have result and no error',
      );
      assert.deepEqual(res.result, [], 'response should have correct result');
    });

    it('returns correct accounts for permitted domain', async function () {
      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      grantPermissions(
        permController,
        DOMAINS.a.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.a.permitted),
      );

      const req = RPC_REQUESTS.eth_accounts(DOMAINS.a.origin);
      const res = {};

      await assert.doesNotReject(aMiddleware(req, res), 'should not reject');

      assert.ok(
        res.result && !res.error,
        'response should have result and no error',
      );
      assert.deepEqual(
        res.result,
        [ACCOUNTS.a.primary],
        'response should have correct result',
      );
    });
  });

  describe('eth_requestAccounts', function () {
    let permController;

    beforeEach(function () {
      permController = initPermController();
    });

    it('requests accounts for unpermitted origin, and approves on user approval', async function () {
      const userApprovalPromise = getUserApprovalPromise(permController);

      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const req = RPC_REQUESTS.eth_requestAccounts(DOMAINS.a.origin);
      const res = {};

      const pendingApproval = assert.doesNotReject(
        aMiddleware(req, res),
        'should not reject permissions request',
      );

      const id = await userApprovalPromise;

      assert.equal(
        getPendingRequests(permController).length,
        1,
        'perm controller should have single pending approval',
      );

      const approvedReq = PERMS.approvedRequest(
        id,
        PERMS.requests.eth_accounts(),
      );

      await permController.approvePermissionsRequest(
        approvedReq,
        ACCOUNTS.a.permitted,
      );

      // wait for permission to be granted
      await pendingApproval;

      const perms = Object.values(
        permController.permissions.getPermissions(DOMAINS.a.origin),
      );

      assert.equal(
        perms.length,
        1,
        'domain should have correct number of permissions',
      );

      validatePermission(
        perms[0],
        PERM_NAMES.eth_accounts,
        DOMAINS.a.origin,
        CAVEATS.eth_accounts(ACCOUNTS.a.permitted),
      );

      // we should also see the accounts on the response
      assert.ok(
        res.result && !res.error,
        'response should have result and no error',
      );

      assert.deepEqual(
        res.result,
        [ACCOUNTS.a.primary],
        'result should have correct accounts',
      );

      // we should also be able to get the accounts independently
      const aAccounts = await permController.getAccounts(DOMAINS.a.origin);
      assert.deepEqual(
        aAccounts,
        [ACCOUNTS.a.primary],
        'origin should have have correct accounts',
      );
    });

    it('requests accounts for unpermitted origin, and rejects on user rejection', async function () {
      const userApprovalPromise = getUserApprovalPromise(permController);

      const aMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.a.origin,
      );

      const req = RPC_REQUESTS.eth_requestAccounts(DOMAINS.a.origin);
      const res = {};

      const expectedError = ERRORS.rejectPermissionsRequest.rejection();

      const requestRejection = assert.rejects(
        aMiddleware(req, res),
        expectedError,
        'request should be rejected with correct error',
      );

      const id = await userApprovalPromise;

      assert.equal(
        getPendingRequests(permController).length,
        1,
        'perm controller should have single pending approval',
      );

      await permController.rejectPermissionsRequest(id);
      await requestRejection;

      assert.ok(
        !res.result &&
          res.error &&
          res.error.message === expectedError.message &&
          res.error.code === expectedError.code,
        'response should have expected error and no result',
      );

      const aAccounts = await permController.getAccounts(DOMAINS.a.origin);
      assert.deepEqual(
        aAccounts,
        [],
        'origin should have have correct accounts',
      );
    });

    it('directly returns accounts for permitted domain', async function () {
      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );

      grantPermissions(
        permController,
        DOMAINS.c.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.c.permitted),
      );

      const req = RPC_REQUESTS.eth_requestAccounts(DOMAINS.c.origin);
      const res = {};

      await assert.doesNotReject(cMiddleware(req, res), 'should not reject');

      assert.ok(
        res.result && !res.error,
        'response should have result and no error',
      );
      assert.deepEqual(
        res.result,
        [ACCOUNTS.c.primary],
        'response should have correct result',
      );
    });

    it('rejects new requests when request already pending', async function () {
      let unlock;
      const unlockPromise = new Promise((resolve) => {
        unlock = resolve;
      });

      const getUnlockPromise = sinon.fake.returns(unlockPromise);
      permController._getUnlockPromise = getUnlockPromise;

      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );

      grantPermissions(
        permController,
        DOMAINS.c.origin,
        PERMS.grants.eth_accounts(ACCOUNTS.c.permitted),
      );

      const req = RPC_REQUESTS.eth_requestAccounts(DOMAINS.c.origin);
      const res = {};

      // this will block until we resolve the unlock Promise
      const requestApproval = assert.doesNotReject(
        cMiddleware(req, res),
        'should not reject',
      );

      // this will reject because of the already pending request
      await assert.rejects(
        cMiddleware({ ...req }, {}),
        ERRORS.eth_requestAccounts.requestAlreadyPending(),
      );

      assert.ok(
        getUnlockPromise.calledOnceWith(true),
        'should wait for unlock',
      );

      // now unlock and let through the first request
      unlock();

      await requestApproval;

      assert.ok(
        res.result && !res.error,
        'response should have result and no error',
      );
      assert.deepEqual(
        res.result,
        [ACCOUNTS.c.primary],
        'response should have correct result',
      );
    });
  });

  describe('metamask_sendDomainMetadata', function () {
    let permController, clock;

    beforeEach(function () {
      permController = initPermController();
      clock = sinon.useFakeTimers(1);
    });

    afterEach(function () {
      clock.restore();
    });

    it('records domain metadata', async function () {
      const name = 'BAZ';

      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );

      const req = RPC_REQUESTS.metamask_sendDomainMetadata(
        DOMAINS.c.origin,
        name,
      );
      const res = {};

      await assert.doesNotReject(cMiddleware(req, res), 'should not reject');

      assert.ok(res.result, 'result should be true');

      const metadataStore = permController.store.getState()[METADATA_STORE_KEY];

      assert.deepEqual(
        metadataStore,
        {
          [DOMAINS.c.origin]: {
            name,
            host: DOMAINS.c.host,
            lastUpdated: 1,
          },
        },
        'metadata should have been added to store',
      );
    });

    it('stores only a bounded name and a web or image icon', async function () {
      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );
      const send = async (name, icon) => {
        const res = {};
        await cMiddleware(
          RPC_REQUESTS.metamask_sendDomainMetadata(
            DOMAINS.c.origin,
            name,
            icon,
          ),
          res,
        );
        assert.ok(res.result);
        return permController.store.getState()[METADATA_STORE_KEY][
          DOMAINS.c.origin
        ];
      };

      const long = await send('x'.repeat(10000), 'https://c.test/icon.png');
      assert.equal(long.name.length, MAX_SITE_NAME_LENGTH);
      // A remote icon is stored by its source and shown only once downloaded.
      assert.notEqual(long.icon, 'https://c.test/icon.png');
      assert.equal(long.iconSource, 'https://c.test/icon.png');

      for (const icon of [
        // eslint-disable-next-line no-script-url -- a page could send one
        'javascript:alert(1)',
        `data:image/png;base64,${'A'.repeat(MAX_ICON_DATA_URL_LENGTH)}`,
        `https://c.test/${'a'.repeat(5000)}`,
        { url: 'https://c.test/icon.png' },
      ]) {
        const stored = await send('Site', icon);
        assert.notEqual(stored.icon, icon, String(icon).slice(0, 30));
      }

      assert.equal(
        (await send('Site', 'data:image/png;base64,iVBORw0KGgo=')).icon,
        'data:image/png;base64,iVBORw0KGgo=',
      );
    });

    it('downloads a remote icon once per URL, and stores only its data URL', async function () {
      // Each download waits until the test answers it.
      const downloads = [];
      const fetchImage = sinon.stub().callsFake(
        () =>
          new Promise((resolve) => {
            downloads.push(resolve);
          }),
      );
      const controller = new PermissionsController({
        ...getPermControllerOpts(),
        fetchImage,
      });
      const cMiddleware = getPermissionsMiddleware(
        controller,
        DOMAINS.c.origin,
      );
      const send = async (icon) => {
        await cMiddleware(
          RPC_REQUESTS.metamask_sendDomainMetadata(DOMAINS.c.origin, 'C', icon),
          {},
        );
        return controller.store.getState()[METADATA_STORE_KEY][
          DOMAINS.c.origin
        ];
      };
      const answer = async (image) => {
        downloads.shift()(image);
        // This block uses fake timers, so let the download's promise settle.
        for (let i = 0; i < 10; i++) {
          await Promise.resolve();
        }
        return controller.store.getState()[METADATA_STORE_KEY][
          DOMAINS.c.origin
        ];
      };

      assert.equal((await send('https://c.test/a.png')).icon, undefined);
      assert.equal(
        (await answer('data:image/png;base64,AAAA')).icon,
        'data:image/png;base64,AAAA',
      );
      // Sent again on every page load: downloaded only once.
      await send('https://c.test/a.png');
      assert.equal(fetchImage.callCount, 1);

      // A new icon replaces the old one once it is downloaded.
      assert.equal((await send('https://c.test/b.png')).icon, undefined);
      assert.equal(
        (await answer('data:image/png;base64,BBBB')).icon,
        'data:image/png;base64,BBBB',
      );

      // A download that finishes after the site named another icon is dropped.
      await send('https://c.test/c.png');
      await send('data:image/png;base64,CCCC');
      const late = await answer('data:image/png;base64,LATE');
      assert.equal(late.icon, 'data:image/png;base64,CCCC');
      assert.equal(late.iconSource, undefined);

      // A failed download leaves no icon, never the URL, and is not tried
      // again when the site sends the same icon.
      await send('https://c.test/missing.png');
      assert.equal((await answer(undefined)).icon, undefined);
      await send('https://c.test/missing.png');
      assert.equal(fetchImage.callCount, 4);
    });

    it('ignores metadata without a usable name', async function () {
      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );
      for (const params of [
        null,
        [],
        { name: '   ' },
        { name: 5 },
        // Could be made to read like another site's name.
        { name: 'paws\u202ewapsinU' },
        { name: 'Uni\u200bswap' },
        { name: 'Site\nUniswap' },
      ]) {
        const res = {};
        await cMiddleware(
          {
            origin: DOMAINS.c.origin,
            method: 'metamask_sendDomainMetadata',
            params,
          },
          res,
        );
        assert.ok(res.result);
      }
      assert.deepEqual(permController.store.getState()[METADATA_STORE_KEY], {});
    });

    it('records domain metadata and preserves extensionId', async function () {
      const extensionId = 'fooExtension';

      const name = 'BAZ';

      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
        extensionId,
      );

      const req = RPC_REQUESTS.metamask_sendDomainMetadata(
        DOMAINS.c.origin,
        name,
      );
      const res = {};

      await assert.doesNotReject(cMiddleware(req, res), 'should not reject');

      assert.ok(res.result, 'result should be true');

      const metadataStore = permController.store.getState()[METADATA_STORE_KEY];

      assert.deepEqual(
        metadataStore,
        { [DOMAINS.c.origin]: { name, extensionId, lastUpdated: 1 } },
        'metadata should have been added to store',
      );
    });

    it('should not record domain metadata if no name', async function () {
      const name = null;

      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );

      const req = RPC_REQUESTS.metamask_sendDomainMetadata(
        DOMAINS.c.origin,
        name,
      );
      const res = {};

      await assert.doesNotReject(cMiddleware(req, res), 'should not reject');

      assert.ok(res.result, 'result should be true');

      const metadataStore = permController.store.getState()[METADATA_STORE_KEY];

      assert.deepEqual(
        metadataStore,
        {},
        'metadata should not have been added to store',
      );
    });

    it('should not record domain metadata if no metadata', async function () {
      const cMiddleware = getPermissionsMiddleware(
        permController,
        DOMAINS.c.origin,
      );

      const req = RPC_REQUESTS.metamask_sendDomainMetadata(DOMAINS.c.origin);
      delete req.params;
      const res = {};

      await assert.doesNotReject(cMiddleware(req, res), 'should not reject');

      assert.ok(res.result, 'result should be true');

      const metadataStore = permController.store.getState()[METADATA_STORE_KEY];

      assert.deepEqual(
        metadataStore,
        {},
        'metadata should not have been added to store',
      );
    });
  });
});
