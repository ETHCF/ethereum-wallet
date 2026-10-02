import assert from 'assert'
import { getGasFeeErrorObject, isBalanceSufficient } from '../send.utils'
import { INSUFFICIENT_FUNDS_ERROR } from '../send.constants'

// Unlike send-utils.test.js, these use the real currency conversion helpers.
describe('send utils balance checks', function () {
  it('compares a balance with the amount and gas, which are all in wei', function () {
    assert.equal(isBalanceSufficient({ amount: '0x5', balance: '0xa', gasTotal: '0x5' }), true)
    assert.equal(isBalanceSufficient({ amount: '0x6', balance: '0xa', gasTotal: '0x5' }), false)
  })

  it('checks the gas fee of a token send without an exchange rate', function () {
    const sendToken = { address: '0x0', symbol: 'TST', decimals: 4 }
    assert.deepEqual(getGasFeeErrorObject({ balance: '0x10', gasTotal: '0x5', sendToken }), { gasFee: null })
    assert.deepEqual(getGasFeeErrorObject({ balance: '0x4', gasTotal: '0x5', sendToken }), { gasFee: INSUFFICIENT_FUNDS_ERROR })
  })
})
