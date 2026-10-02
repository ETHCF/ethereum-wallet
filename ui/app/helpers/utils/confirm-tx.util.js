import * as ethUtil from 'ethereumjs-util'
import BigNumber from 'bignumber.js'
import { bumpFee } from '../../../../app/scripts/lib/transaction-fees'

import { unconfirmedTransactionsCountSelector } from '../../selectors'
import {
  conversionUtil,
  addCurrencies,
  multiplyCurrencies,
  conversionGreaterThan,
} from './conversion-util'

export function increaseLastGasPrice (lastGasPrice) {
  return bumpFee(lastGasPrice || '0x0')
}

export function hexGreaterThan (a, b) {
  return conversionGreaterThan(
    { value: a, fromNumericBase: 'hex' },
    { value: b, fromNumericBase: 'hex' },
  )
}

export function getHexGasTotal ({ gasLimit, gasPrice }) {
  return ethUtil.addHexPrefix(multiplyCurrencies(gasLimit || '0x0', gasPrice || '0x0', {
    toNumericBase: 'hex',
    multiplicandBase: 16,
    multiplierBase: 16,
  }))
}

export function addEth (...args) {
  return args.reduce((acc, base) => {
    return addCurrencies(acc, base, {
      toNumericBase: 'dec',
      numberOfDecimals: 6,
    })
  })
}

export function getValueFromWeiHex ({
  value,
  fromCurrency = 'ETH',
  toCurrency,
  numberOfDecimals,
  toDenomination,
}) {
  return conversionUtil(value, {
    fromNumericBase: 'hex',
    toNumericBase: 'dec',
    fromCurrency,
    toCurrency,
    numberOfDecimals,
    fromDenomination: 'WEI',
    toDenomination,
  })
}

export function getTransactionFee ({
  value,
  fromCurrency = 'ETH',
  toCurrency,
  numberOfDecimals,
}) {
  return conversionUtil(value, {
    fromNumericBase: 'BN',
    toNumericBase: 'dec',
    fromDenomination: 'WEI',
    fromCurrency,
    toCurrency,
    numberOfDecimals,
  })
}

export function hasUnconfirmedTransactions (state) {
  return unconfirmedTransactionsCountSelector(state) > 0
}

export function roundExponential (value) {
  const PRECISION = 4
  const bigNumberValue = new BigNumber(String(value))

  // In JS, numbers with exponentials greater than 20 get displayed as an exponential.
  return bigNumberValue.e > 20 ? Number(bigNumberValue.toPrecision(PRECISION)) : value
}
