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

export function getRenderableBasicEstimateData(state, gasLimit) {
  if (getBasicGasEstimateLoadingStatus(state)) {
    return [];
  }

  const {
    gas: {
      basicEstimates: { safeLow, average, fast },
    },
  } = state;

  return [
    {
      gasEstimateType: GAS_ESTIMATE_TYPES.SLOW,
      feeInPrimaryCurrency: getRenderableEthFee(safeLow, gasLimit),
      priceInHexWei: getGasPriceInHexWei(safeLow),
    },
    {
      gasEstimateType: GAS_ESTIMATE_TYPES.AVERAGE,
      feeInPrimaryCurrency: getRenderableEthFee(average, gasLimit),
      priceInHexWei: getGasPriceInHexWei(average),
    },
    {
      gasEstimateType: GAS_ESTIMATE_TYPES.FAST,
      feeInPrimaryCurrency: getRenderableEthFee(fast, gasLimit),
      priceInHexWei: getGasPriceInHexWei(fast),
    },
  ];
}

export function getRenderableEstimateDataForSmallButtonsFromGWEI(state) {
  if (getBasicGasEstimateLoadingStatus(state)) {
    return [];
  }

  const gasLimit =
    state.ecfWallet.send.gasLimit || getCustomGasLimit(state) || '0x5208';
  const {
    gas: {
      basicEstimates: { safeLow, average, fast },
    },
  } = state;

  return [
    {
      gasEstimateType: GAS_ESTIMATE_TYPES.SLOW,
      feeInPrimaryCurrency: getRenderableEthFee(
        safeLow,
        gasLimit,
        NUMBER_OF_DECIMALS_SM_BTNS,
        true,
      ),
      priceInHexWei: getGasPriceInHexWei(safeLow, true),
    },
    {
      gasEstimateType: GAS_ESTIMATE_TYPES.AVERAGE,
      feeInPrimaryCurrency: getRenderableEthFee(
        average,
        gasLimit,
        NUMBER_OF_DECIMALS_SM_BTNS,
        true,
      ),
      priceInHexWei: getGasPriceInHexWei(average, true),
    },
    {
      gasEstimateType: GAS_ESTIMATE_TYPES.FAST,
      feeInPrimaryCurrency: getRenderableEthFee(
        fast,
        gasLimit,
        NUMBER_OF_DECIMALS_SM_BTNS,
        true,
      ),
      priceInHexWei: getGasPriceInHexWei(fast, true),
    },
  ];
}
