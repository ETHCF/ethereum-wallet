import { strict as assert } from 'assert';

import txHelper from '../../../../../ui/lib/tx-helper';

describe('txHelper', function () {
  it('always shows the oldest tx first', function () {
    const ecfWalletNetworkId = '1';
    const txs = {
      a: { ecfWalletNetworkId, time: 3 },
      b: { ecfWalletNetworkId, time: 1 },
      c: { ecfWalletNetworkId, time: 2 },
    };

    const sorted = txHelper(txs, null, null, null, null, ecfWalletNetworkId);
    assert.equal(sorted[0].time, 1, 'oldest tx first');
    assert.equal(sorted[2].time, 3, 'newest tx last');
  });

  it('only filters transactions by network, and merges messages by time', function () {
    const txs = {
      a: { id: 'a', ecfWalletNetworkId: '1', time: 4 },
      b: { id: 'b', ecfWalletNetworkId: '5', time: 1 },
    };
    const personalMsgs = { c: { id: 'c', time: 3 } };
    const typedMessages = { d: { id: 'd', time: 2 } };

    const sorted = txHelper(txs, personalMsgs, {}, {}, typedMessages, '1');
    assert.deepEqual(
      sorted.map(({ id }) => id),
      ['d', 'c', 'a'],
    );
  });
});
