import assert from 'assert'
import { renderHook } from '@testing-library/react'
import * as reactRedux from 'react-redux'
import sinon from 'sinon'
import { useUserPreferencedCurrency } from '../useUserPreferencedCurrency'

const tests = [
  {
    ticker: 'ETH',
    params: {},
    result: {
      currency: 'ETH',
      numberOfDecimals: 6,
    },
  },
  {
    ticker: undefined,
    params: undefined,
    result: {
      currency: 'ETH',
      numberOfDecimals: 6,
    },
  },
  {
    ticker: 'ETC',
    params: {
      ethNumberOfDecimals: 4,
    },
    result: {
      currency: 'ETC',
      numberOfDecimals: 4,
    },
  },
  {
    ticker: 'ETH',
    params: {
      ethNumberOfDecimals: 4,
      numberOfDecimals: 3,
    },
    result: {
      currency: 'ETH',
      numberOfDecimals: 3,
    },
  },
]

function getFakeUseSelector (ticker) {
  const state = {
    ecfWallet: {
      provider: ticker ? { type: 'mainnet', ticker } : undefined,
    },
  }
  return (selector) => selector(state)
}

describe('useUserPreferencedCurrency', function () {
  tests.forEach(({ ticker, params, result }) => {
    describe(`when the provider ticker is ${ticker} and params are ${JSON.stringify(params)}`, function () {
      const stub = sinon.stub(reactRedux, 'useSelector')
      stub.callsFake(getFakeUseSelector(ticker))

      const { result: hookResult } = renderHook(() => useUserPreferencedCurrency(params))
      stub.restore()
      it(`should return currency as ${result.currency}`, function () {
        assert.equal(hookResult.current.currency, result.currency)
      })
      it(`should return decimals as ${result.numberOfDecimals}`, function () {
        assert.equal(hookResult.current.numberOfDecimals, result.numberOfDecimals)
      })
    })
  })
})
