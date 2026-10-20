import { BigNumber } from 'bignumber.js';
import { cloneDeep } from 'lodash';

import { decGWEIToHexWEI } from '../../helpers/utils/conversions.util';
import { DISPLAY_WARNING } from '../../store/actionConstants';

// Actions
const BASIC_GAS_ESTIMATE_LOADING_FINISHED =
  'ecf-wallet/gas/BASIC_GAS_ESTIMATE_LOADING_FINISHED';
const BASIC_GAS_ESTIMATE_LOADING_STARTED =
  'ecf-wallet/gas/BASIC_GAS_ESTIMATE_LOADING_STARTED';
const RESET_CUSTOM_DATA = 'ecf-wallet/gas/RESET_CUSTOM_DATA';
const SET_BASIC_GAS_ESTIMATE_DATA =
  'ecf-wallet/gas/SET_BASIC_GAS_ESTIMATE_DATA';
const SET_CUSTOM_GAS_LIMIT = 'ecf-wallet/gas/SET_CUSTOM_GAS_LIMIT';
const SET_CUSTOM_GAS_PRICE = 'ecf-wallet/gas/SET_CUSTOM_GAS_PRICE';

// Gas prices in GWEI, from the network's eth_gasPrice
const initState = {
  customData: {
    price: null,
    limit: null,
  },
  basicEstimates: {
    safeLow: null,
    average: null,
    fast: null,
  },
  basicEstimateIsLoading: true,
};

// Reducer
export default function reducer(state = initState, action) {
  switch (action.type) {
    case BASIC_GAS_ESTIMATE_LOADING_STARTED:
      return {
        ...state,
        basicEstimateIsLoading: true,
      };
    case BASIC_GAS_ESTIMATE_LOADING_FINISHED:
      return {
        ...state,
        basicEstimateIsLoading: false,
      };
    case SET_BASIC_GAS_ESTIMATE_DATA:
      return {
        ...state,
        basicEstimates: action.value,
      };
    case SET_CUSTOM_GAS_PRICE:
      return {
        ...state,
        customData: {
          ...state.customData,
          price: action.value,
        },
      };
    case SET_CUSTOM_GAS_LIMIT:
      return {
        ...state,
        customData: {
          ...state.customData,
          limit: action.value,
        },
      };
    case RESET_CUSTOM_DATA:
      return {
        ...state,
        customData: cloneDeep(initState.customData),
      };
    default:
      return state;
  }
}

// Action Creators
export function basicGasEstimatesLoadingStarted() {
  return {
    type: BASIC_GAS_ESTIMATE_LOADING_STARTED,
  };
}

export function basicGasEstimatesLoadingFinished() {
  return {
    type: BASIC_GAS_ESTIMATE_LOADING_FINISHED,
  };
}

const WEI_PER_GWEI = '1000000000';

function query(method, ...args) {
  return new Promise((resolve, reject) => {
    global.ethQuery[method](...args, (error, result) =>
      error ? reject(error) : resolve(result),
    );
  });
}

function toGwei(hexWei) {
  if (typeof hexWei !== 'string' || !/^0x[0-9a-f]+$/iu.test(hexWei)) {
    throw new Error('Invalid gas price from the network');
  }
  return new BigNumber(hexWei.slice(2), 16).div(WEI_PER_GWEI);
}

/**
 * Derives the slow, average and fast gas prices from the network's suggested
 * price (eth_gasPrice). The suggestion is the average; slow pays less, but
 * never less than the latest block's base fee, so that it can still be mined
 * on networks with EIP-1559 fees.
 *
 * Some nodes suggest exactly the base fee, which leaves no room below it for
 * slow. Average is then raised above slow by the most the base fee can rise in
 * one block (12.5%), so that the three prices stay distinct. The gas buttons
 * are matched by price, so equal prices would make two of them inseparable.
 *
 * @returns {Promise<object>} The estimates, in GWEI
 */
async function getNetworkGasEstimates() {
  const [gasPrice, block] = await Promise.all([
    query('gasPrice'),
    query('getBlockByNumber', 'latest', false).catch(() => null),
  ]);
  const suggested = toGwei(
    typeof gasPrice === 'string' ? gasPrice : `0x${gasPrice.toString(16)}`,
  );
  const baseFee = block?.baseFeePerGas
    ? toGwei(block.baseFeePerGas)
    : new BigNumber(0);
  const toNumber = (price) =>
    price.decimalPlaces(9, BigNumber.ROUND_UP).toNumber();
  const safeLow = BigNumber.max(suggested.times(0.9), baseFee);
  const average = suggested.gt(safeLow) ? suggested : safeLow.times(1.125);
  return {
    safeLow: toNumber(safeLow),
    average: toNumber(average),
    fast: toNumber(average.times(1.25)),
  };
}

export function fetchBasicGasEstimates() {
  return async (dispatch) => {
    dispatch(basicGasEstimatesLoadingStarted());

    let basicEstimates;
    try {
      basicEstimates = await getNetworkGasEstimates();
    } catch (_) {
      dispatch({
        type: DISPLAY_WARNING,
        value: 'Unable to fetch gas estimates. Check your network connection.',
      });
      basicEstimates = { ...initState.basicEstimates };
    }

    dispatch(setBasicGasEstimateData(basicEstimates));
    dispatch(basicGasEstimatesLoadingFinished());
    return basicEstimates;
  };
}

export function setCustomGasPriceForRetry(newPrice) {
  return (dispatch, getState) => {
    if (newPrice === '0x0') {
      const { fast } = getState().gas.basicEstimates;
      dispatch(setCustomGasPrice(decGWEIToHexWEI(fast)));
    } else {
      dispatch(setCustomGasPrice(newPrice));
    }
  };
}

export function setBasicGasEstimateData(basicGasEstimateData) {
  return {
    type: SET_BASIC_GAS_ESTIMATE_DATA,
    value: basicGasEstimateData,
  };
}

export function setCustomGasPrice(newPrice) {
  return {
    type: SET_CUSTOM_GAS_PRICE,
    value: newPrice,
  };
}

export function setCustomGasLimit(newLimit) {
  return {
    type: SET_CUSTOM_GAS_LIMIT,
    value: newLimit,
  };
}

export function resetCustomData() {
  return { type: RESET_CUSTOM_DATA };
}
