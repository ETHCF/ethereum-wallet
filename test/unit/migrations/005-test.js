import { strict as assert } from 'assert';

import migration5 from '../../../app/scripts/migrations/005';

const LOCALHOST_NETWORK = {
  rpcUrl: 'http://localhost:8545',
  chainId: '0x539',
  ticker: 'ETH',
  nickname: 'Localhost 8545',
  rpcPrefs: {},
};

describe('migration #5', function () {
  it('turns the Localhost 8545 network into a custom network tied to a chain', async function () {
    const other = {
      rpcUrl: 'https://rpc.test',
      chainId: '0x89',
      ticker: 'POL',
      nickname: 'Other',
      rpcPrefs: {},
    };
    const { meta, data } = await migration5.migrate({
      meta: { version: 4 },
      data: {
        NetworkController: { provider: { type: 'localhost', rpcTarget: '' } },
        PreferencesController: { frequentRpcListDetail: [other] },
      },
    });
    assert.equal(meta.version, 5);
    assert.deepEqual(data.NetworkController.provider, {
      type: 'rpc',
      rpcTarget: 'http://localhost:8545',
      chainId: '0x539',
      ticker: 'ETH',
      nickname: 'Localhost 8545',
      rpcPrefs: {},
    });
    assert.deepEqual(data.PreferencesController.frequentRpcListDetail, [
      other,
      LOCALHOST_NETWORK,
    ]);
  });

  it('keeps a custom network the user already has for that URL', async function () {
    const mine = { ...LOCALHOST_NETWORK, chainId: '0x7a69', nickname: 'Anvil' };
    const { data } = await migration5.migrate({
      meta: { version: 4 },
      data: {
        NetworkController: { provider: { type: 'localhost' } },
        PreferencesController: { frequentRpcListDetail: [mine] },
      },
    });
    assert.deepEqual(data.NetworkController.provider, {
      type: 'rpc',
      rpcTarget: 'http://localhost:8545',
      chainId: '0x7a69',
      ticker: 'ETH',
      nickname: 'Anvil',
      rpcPrefs: {},
    });
    assert.deepEqual(data.PreferencesController.frequentRpcListDetail, [mine]);
  });

  it('leaves other networks and fresh state alone', async function () {
    const state = {
      NetworkController: { provider: { type: 'mainnet' } },
      PreferencesController: { frequentRpcListDetail: [] },
    };
    const { meta, data } = await migration5.migrate({
      meta: { version: 4 },
      data: state,
    });
    assert.equal(meta.version, 5);
    assert.deepEqual(data, state);

    assert.deepEqual(
      (await migration5.migrate({ meta: { version: 4 }, data: {} })).data,
      {},
    );
  });
});
