import { strict as assert } from 'assert';

import migration4 from '../../../app/scripts/migrations/004';

describe('migration #4', function () {
  it('removes the permissions activity log and unused preferences', async function () {
    const { meta, data } = await migration4.migrate({
      meta: { version: 3 },
      data: {
        PermissionsMetadata: {
          permissionsLog: [{ method: 'eth_accounts' }],
          permissionsHistory: { 'https://a.test': {} },
          domainMetadata: {},
        },
        PreferencesController: {
          lostIdentities: { '0x1': { name: 'Account 1', address: '0x1' } },
          forgottenPassword: false,
          useNonceField: true,
          ipfsGateway: 'dweb.link',
          identities: {},
        },
        Other: { a: 1 },
      },
    });
    assert.equal(meta.version, 4);
    assert.deepEqual(data, {
      PermissionsMetadata: {
        permissionsHistory: { 'https://a.test': {} },
        domainMetadata: {},
      },
      PreferencesController: { ipfsGateway: 'dweb.link', identities: {} },
      Other: { a: 1 },
    });
  });

  it('leaves fresh state alone', async function () {
    const { meta, data } = await migration4.migrate({
      meta: { version: 3 },
      data: {},
    });
    assert.equal(meta.version, 4);
    assert.deepEqual(data, {});
  });
});
