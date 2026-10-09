import { addHexPrefix } from '@ethereumjs/util';

import { GAS_ESTIMATE_TYPES } from '../helpers/constants/common';
import {
  conversionUtil,
  conversionGreaterThan,
} from '../helpers/utils/conversion-util';
import { formatETHFee } from '../helpers/utils/formatters';
import { calcGasTotal } from '../pages/send/send.utils';

const NUMBER_OF_DECIMALS_SM_BTNS = 5;

export function getCustomGasLimit(state) {
  return state.gas.customData.limit;
}

export function getCustomGasPrice(state) {
  return state.gas.customData.price;
}

export function getBasicGasEstimateLoadingStatus(state) {
  return state.gas.basicEstimateIsLoading;
}

export function getAveragePriceEstimateInHexWEI(state) {
  const averagePriceEstimate = state.gas.basicEstimates.average;
  return getGasPriceInHexWei(averagePriceEstimate || '0x0');
}

export function getFastPriceEstimateInHexWEI(state) {
  const fastPriceEstimate = state.gas.basicEstimates.fast;
  return getGasPriceInHexWei(fastPriceEstimate || '0x0');
}

export function getDefaultActiveButtonIndex(
  gasButtonInfo,
  customGasPriceInHex,
  gasPrice,
) {
  return gasButtonInfo.findIndex(({ priceInHexWei }) => {
    return priceInHexWei === addHexPrefix(customGasPriceInHex || gasPrice);
  });
}

export function getSafeLowEstimate(state) {
  const {
    gas: {
      basicEstimates: { safeLow },
    },
  } = state;

  return safeLow;
}

export function isCustomPriceSafe(state) {
  const safeLow = getSafeLowEstimate(state);
  const customGasPrice = getCustomGasPrice(state);

  if (!customGasPrice) {
    return true;
  }

  if (safeLow === null) {
    return null;
  }

  const customPriceSafe = conversionGreaterThan(
    {
      value: customGasPrice,
      fromNumericBase: 'hex',
      fromDenomination: 'WEI',
      toDenomination: 'GWEI',
    },
    { value: safeLow, fromNumericBase: 'dec' },
  );

  return customPriceSafe;
}

export function basicPriceEstimateToETHTotal(
  estimate,
  gasLimit,
  numberOfDecimals = 9,
) {
  return conversionUtil(calcGasTotal(gasLimit, estimate), {
    fromNumericBase: 'hex',
    toNumericBase: 'dec',
    fromDenomination: 'GWEI',
    numberOfDecimals,
  });
}

export function getRenderableEthFee(estimate, gasLimit, numberOfDecimals = 9) {
  const value = conversionUtil(estimate, {
    fromNumericBase: 'dec',
    toNumericBase: 'hex',
  });
  const fee = basicPriceEstimateToETHTotal(value, gasLimit, numberOfDecimals);
  return formatETHFee(fee);
}

export function priceEstimateToWei(priceEstimate) {
  return conversionUtil(priceEstimate, {
    fromNumericBase: 'hex',
    toNumericBase: 'hex',
    fromDenomination: 'GWEI',
    toDenomination: 'WEI',
    numberOfDecimals: 9,
  });
}

export function getGasPriceInHexWei(price) {
  const value = conversionUtil(price, {
    fromNumericBase: 'dec',
    toNumericBase: 'hex',
  });
  return addHexPrefix(priceEstimateToWei(value));
}

/**
 * Builds the slow/average/fast gas button rows from the basic estimates.
 *
 * @param {object} state - The Redux state.
 * @param {string} gasLimit - The gas limit (hex) used to compute each fee.
 * @param {number} [numberOfDecimals] - Decimal places for the fee.
 * @returns {object[]} The rows, or an empty array while estimates load.
 */
function getRenderableEstimateRows(state, gasLimit, numberOfDecimals) {
  if (getBasicGasEstimateLoadingStatus(state)) {
    return [];
  }

  const { safeLow, average, fast } = state.gas.basicEstimates;

  return [
    [GAS_ESTIMATE_TYPES.SLOW, safeLow],
    [GAS_ESTIMATE_TYPES.AVERAGE, average],
    [GAS_ESTIMATE_TYPES.FAST, fast],
  ].map(([gasEstimateType, estimate]) => ({
    gasEstimateType,
    feeInPrimaryCurrency: getRenderableEthFee(
      estimate,
      gasLimit,
      numberOfDecimals,
    ),
    priceInHexWei: getGasPriceInHexWei(estimate),
  }));
}

export function getRenderableBasicEstimateData(state, gasLimit) {
  return getRenderableEstimateRows(state, gasLimit);
}

export function getRenderableEstimateDataForSmallButtonsFromGWEI(state) {
  const gasLimit =
    state.ecfWallet.send.gasLimit || getCustomGasLimit(state) || '0x5208';
  return getRenderableEstimateRows(state, gasLimit, NUMBER_OF_DECIMALS_SM_BTNS);
}
