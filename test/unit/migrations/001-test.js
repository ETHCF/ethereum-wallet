import { strict as assert } from 'assert';

import migration1 from '../../../app/scripts/migrations/001';

describe('migration #1', function () {
  it('moves wallets on shut-down testnets to Sepolia', async function () {
    for (const type of ['ropsten', 'rinkeby', 'kovan', 'goerli']) {
      const { meta, data } = await migration1.migrate({
        meta: { version: 0 },
        data: {
          NetworkController: {
            provider: { type, rpcTarget: '', ticker: 'ETH', nickname: '' },
          },
          Other: { a: 1 },
        },
      });
      assert.equal(meta.version, 1);
      assert.deepEqual(data.NetworkController.provider, {
        type: 'sepolia',
        rpcTarget: '',
        ticker: 'SepoliaETH',
        nickname: '',
      });
      assert.deepEqual(data.Other, { a: 1 });
    }
  });

  it('leaves other networks and fresh state alone', async function () {
    const provider = {
      type: 'rpc',
      rpcTarget: 'https://rpc.test',
      chainId: '0x89',
      ticker: 'POL',
      nickname: 'Test',
    };
    assert.deepEqual(
      (
        await migration1.migrate({
          meta: { version: 0 },
          data: { NetworkController: { provider } },
        })
      ).data.NetworkController.provider,
      provider,
    );
    assert.deepEqual(
      (await migration1.migrate({ meta: { version: 0 }, data: {} })).data,
      {},
    );
  });
});
