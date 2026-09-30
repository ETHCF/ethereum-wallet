import { strict as assert } from 'assert'
import txHelper from '../../../../../ui/lib/tx-helper'

describe('txHelper', function () {
  it('always shows the oldest tx first', function () {
    const ecfWalletNetworkId = '1'
    const txs = {
      a: { ecfWalletNetworkId, time: 3 },
      b: { ecfWalletNetworkId, time: 1 },
      c: { ecfWalletNetworkId, time: 2 },
    }

    const sorted = txHelper(txs, null, null, ecfWalletNetworkId)
    assert.equal(sorted[0].time, 1, 'oldest tx first')
    assert.equal(sorted[2].time, 3, 'newest tx last')
  })
})
