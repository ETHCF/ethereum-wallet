import { strict as assert } from 'assert';

import migration2 from '../../../app/scripts/migrations/002';
import personalSignState from '../../e2e/fixtures/personal-sign/state.json';

const origin = 'http://127.0.0.1:8080';
const account = '0x5cfe73b6021e818b776b421b1c4db2474086a7e1';
const caveats = (accounts) => [
  { type: 'limitResponseLength', value: 1, name: 'primaryAccountOnly' },
  { type: 'filterResponse', value: accounts, name: 'exposedAccounts' },
];
const migrate = async (data) =>
  (await migration2.migrate({ meta: { version: 1 }, data })).data;

describe('migration #2', function () {
  it('converts rpc-cap eth_accounts permissions from a real wallet state', async function () {
    const { meta, data } = await migration2.migrate({
      meta: { version: 1 },
      data: personalSignState.data,
    });
    assert.equal(meta.version, 2);
    assert.equal(data.PermissionsController, undefined);
    const {
      PermissionsController: { domains },
    } = personalSignState.data;
    const old = domains[origin].permissions[0];
    assert.deepEqual(data.PermissionController, {
      subjects: {
        [origin]: {
          origin,
          permissions: {
            eth_accounts: {
              id: old.id,
              parentCapability: 'eth_accounts',
              invoker: origin,
              date: old.date,
              caveats: [{ type: 'restrictReturnedAccounts', value: [account] }],
            },
          },
        },
      },
    });
    assert.deepEqual(
      data.PermissionsMetadata,
      personalSignState.data.PermissionsMetadata,
    );
  });

  it('keeps only valid, known, distinct accounts and skips sites left without any', async function () {
    const other = `0x${'a'.repeat(40)}`;
    const data = await migrate({
      PreferencesController: { identities: { [account]: {}, [other]: {} } },
      PermissionsController: {
        domains: {
          'https://keep.test': {
            permissions: [
              {
                parentCapability: 'eth_accounts',
                caveats: caveats([
                  account,
                  account,
                  'nope',
                  `0x${'b'.repeat(40)}`,
                  other,
                ]),
              },
            ],
          },
          'https://unknown.test': {
            permissions: [
              {
                parentCapability: 'eth_accounts',
                caveats: caveats([`0x${'c'.repeat(40)}`]),
              },
            ],
          },
          'https://no-caveat.test': {
            permissions: [{ parentCapability: 'eth_accounts' }],
          },
          'https://other.test': {
            permissions: [
              { parentCapability: 'wallet_other', caveats: caveats([account]) },
            ],
          },
          'https://bad.test': { permissions: 'nope' },
          'https://null.test': null,
        },
      },
    });
    assert.deepEqual(Object.keys(data.PermissionController.subjects), [
      'https://keep.test',
    ]);
    const permission =
      data.PermissionController.subjects['https://keep.test'].permissions
        .eth_accounts;
    assert.deepEqual(permission.caveats, [
      { type: 'restrictReturnedAccounts', value: [account, other] },
    ]);
    assert.equal(typeof permission.id, 'string');
    assert.equal(typeof permission.date, 'number');
  });

  it('leaves state without rpc-cap permissions alone', async function () {
    assert.deepEqual(await migrate({}), {});
    assert.deepEqual(
      await migrate({ PermissionsController: 'corrupt', Other: 1 }),
      { PermissionsController: 'corrupt', Other: 1 },
    );
    assert.deepEqual(await migrate({ PermissionsController: {} }), {
      PermissionController: { subjects: {} },
    });
  });
});
