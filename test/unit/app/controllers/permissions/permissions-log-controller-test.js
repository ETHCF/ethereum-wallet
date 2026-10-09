import { ObservableStore } from '@metamask/obs-store';
import { strict as assert } from 'assert';
import { useFakeTimers } from 'sinon';

import { constants, getters, noop } from './mocks';
import PermissionsLogController from '../../../../../app/scripts/controllers/permissions/permissionsLog';

const { PERMS, RPC_REQUESTS } = getters;

const { ACCOUNTS, EXTRA_ACCOUNT, EXPECTED_HISTORIES, DOMAINS, PERM_NAMES } =
  constants;

let clock;

const initPermLog = () => {
  return new PermissionsLogController({ store: new ObservableStore() });
};

const mockNext = (handler) => {
  if (handler) {
    handler(noop);
  }
};

const initMiddleware = (permLog) => {
  const middleware = permLog.createMiddleware();
  return (req, res, next = mockNext) => {
    middleware(req, res, next);
  };
};

const initClock = () => {
  // useFakeTimers, is in fact, not a react-hook
  // eslint-disable-next-line
  clock = useFakeTimers(1)
};

const tearDownClock = () => {
  clock.restore();
};

const getSavedMockNext = (arr) => (handler) => {
  arr.push(handler);
};

describe('permissions log', function () {
  describe('permissions history', function () {
    let permLog, logMiddleware;

    beforeEach(function () {
      permLog = initPermLog();
      logMiddleware = initMiddleware(permLog);
      initClock();
    });

    afterEach(function () {
      tearDownClock();
    });

    it('ignores other methods', function () {
      let nextCalled = false;
      logMiddleware(
        { origin: DOMAINS.a.origin, method: 'eth_accounts' },
        { result: ACCOUNTS.a.permitted },
        (handler) => {
          nextCalled = true;
          assert.equal(handler, undefined, 'should not capture the response');
        },
      );

      assert.ok(nextCalled, 'should call next');
      assert.deepEqual(permLog.getHistory(), {});
    });

    it('only updates history on responses', function () {
      let permHistory;

      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {
        result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
      };

      // noop => no response
      logMiddleware({ ...req }, { ...res }, noop);

      permHistory = permLog.getHistory();
      assert.deepEqual(permHistory, {}, 'history should not have been updated');

      // response => records granted permissions
      logMiddleware({ ...req }, { ...res });

      permHistory = permLog.getHistory();
      assert.equal(
        Object.keys(permHistory).length,
        1,
        'history should have single origin',
      );
      assert.deepEqual(
        permHistory,
        EXPECTED_HISTORIES.case1[0],
        'history should have expected origin',
      );
    });

    it('ignores failed permissions requests', function () {
      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      delete req.params;
      const res = {
        error: new Error('Expected an object of requested permissions.'),
        result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
      };

      // error => no history
      logMiddleware({ ...req }, { ...res });

      assert.deepEqual(
        permLog.getHistory(),
        {},
        'history should not have been updated',
      );
    });

    it('records and updates account history as expected', async function () {
      let permHistory;

      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {
        result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
      };

      logMiddleware({ ...req }, { ...res });

      // validate history

      permHistory = permLog.getHistory();

      assert.deepEqual(
        permHistory,
        EXPECTED_HISTORIES.case1[0],
        'should have correct history',
      );

      // mock permission requested again, with another approved account

      clock.tick(1);

      res.result = [PERMS.granted.eth_accounts([ACCOUNTS.a.permitted[0]])];

      logMiddleware({ ...req }, { ...res });

      permHistory = permLog.getHistory();

      assert.deepEqual(
        permHistory,
        EXPECTED_HISTORIES.case1[1],
        'should have correct history',
      );
    });

    it('handles eth_accounts response without caveats', async function () {
      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {
        result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
      };
      delete res.result[0].caveats;

      logMiddleware({ ...req }, { ...res });

      // validate history

      assert.deepEqual(
        permLog.getHistory(),
        EXPECTED_HISTORIES.case2[0],
        'should have expected history',
      );
    });

    it('handles extra caveats for eth_accounts', async function () {
      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {
        result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
      };
      res.result[0].caveats.push({ foo: 'bar' });

      logMiddleware({ ...req }, { ...res });

      // validate history

      assert.deepEqual(
        permLog.getHistory(),
        EXPECTED_HISTORIES.case1[0],
        'should have correct history',
      );
    });

    it('ignores caveats of other types for eth_accounts', async function () {
      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {
        result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
      };
      res.result[0].caveats.push({ type: 'foo', value: [EXTRA_ACCOUNT] });
      // old rpc-cap caveat shape
      res.result[0].caveats.push({
        name: 'exposedAccounts',
        type: 'filterResponse',
        value: [EXTRA_ACCOUNT],
      });

      logMiddleware({ ...req }, { ...res });

      assert.deepEqual(
        permLog.getHistory(),
        EXPECTED_HISTORIES.case1[0],
        'should have correct history',
      );
    });

    it('ignores other permissions on the response', async function () {
      const req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      const res = {
        result: [
          PERMS.granted.eth_accounts(ACCOUNTS.a.permitted),
          { parentCapability: PERM_NAMES.does_not_exist },
        ],
      };

      logMiddleware({ ...req }, { ...res });

      // validate history

      assert.deepEqual(
        permLog.getHistory(),
        EXPECTED_HISTORIES.case1[0],
        'should have correct history',
      );
    });

    it('does not update history if no new permissions are approved', async function () {
      let req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      let res = {
        result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
      };

      logMiddleware({ ...req }, { ...res });

      // validate history

      assert.deepEqual(
        permLog.getHistory(),
        EXPECTED_HISTORIES.case4[0],
        'should have correct history',
      );

      // new permission requested, but not approved

      clock.tick(1);

      req = RPC_REQUESTS.requestPermission(
        DOMAINS.a.origin,
        PERM_NAMES.eth_accounts,
      );
      res = {
        result: [],
      };

      logMiddleware({ ...req }, { ...res });

      // validate history

      assert.deepEqual(
        permLog.getHistory(),
        EXPECTED_HISTORIES.case4[0],
        'should have same history as before',
      );
    });

    it('records and updates history for multiple origins, regardless of response order', async function () {
      let permHistory;

      // make first round of requests

      const round1 = [];
      const handlers1 = [];

      // first origin
      round1.push({
        req: RPC_REQUESTS.requestPermission(
          DOMAINS.a.origin,
          PERM_NAMES.eth_accounts,
        ),
        res: {
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        },
      });

      // second origin
      round1.push({
        req: RPC_REQUESTS.requestPermission(
          DOMAINS.b.origin,
          PERM_NAMES.eth_accounts,
        ),
        res: {
          result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
        },
      });

      // third origin, via eth_requestAccounts
      round1.push({
        req: RPC_REQUESTS.eth_requestAccounts(DOMAINS.c.origin),
        res: {
          result: ACCOUNTS.c.permitted,
        },
      });

      // make requests and process responses out of order
      round1.forEach((x) => {
        logMiddleware({ ...x.req }, { ...x.res }, getSavedMockNext(handlers1));
      });

      for (const i of [1, 2, 0]) {
        handlers1[i](noop);
      }

      // validate history
      permHistory = permLog.getHistory();

      assert.deepEqual(
        permHistory,
        EXPECTED_HISTORIES.case3[0],
        'should have expected history',
      );

      // make next round of requests

      clock.tick(1);

      const round2 = [];
      // we're just gonna process these in order

      // first origin
      round2.push({
        req: RPC_REQUESTS.requestPermission(
          DOMAINS.a.origin,
          PERM_NAMES.eth_accounts,
        ),
        res: {
          result: [PERMS.granted.eth_accounts([ACCOUNTS.a.permitted[0]])],
        },
      });

      // nothing for second origin

      // third origin
      round2.push({
        req: RPC_REQUESTS.requestPermissions(DOMAINS.c.origin, {
          [PERM_NAMES.eth_accounts]: {},
        }),
        res: {
          result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
        },
      });

      // make requests
      round2.forEach((x) => {
        logMiddleware({ ...x.req }, { ...x.res });
      });

      // validate history
      permHistory = permLog.getHistory();

      assert.deepEqual(
        permHistory,
        EXPECTED_HISTORIES.case3[1],
        'should have expected history',
      );
    });
  });
});
