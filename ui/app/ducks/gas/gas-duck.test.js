import assert from 'assert';
import sinon from 'sinon';

import GasReducer, {
  basicGasEstimatesLoadingStarted,
  basicGasEstimatesLoadingFinished,
  fetchBasicGasEstimates,
  resetCustomData,
  setBasicGasEstimateData,
  setCustomGasLimit,
  setCustomGasPrice,
  setCustomGasPriceForRetry,
} from './gas.duck';

describe('Gas Duck', function () {
  const initState = GasReducer(undefined, {});
  let originalEthQuery;

  // Answers eth_gasPrice and eth_getBlockByNumber like ethjs-query does.
  function stubNetwork({ gasPrice, baseFeePerGas, gasPriceError } = {}) {
    global.ethQuery = {
      gasPrice: sinon.spy((callback) =>
        callback(gasPriceError || null, gasPrice),
      ),
      getBlockByNumber: sinon.spy((_block, _full, callback) =>
        callback(null, baseFeePerGas ? { baseFeePerGas } : {}),
      ),
    };
  }

  beforeEach(function () {
    originalEthQuery = global.ethQuery;
  });

  afterEach(function () {
    global.ethQuery = originalEthQuery;
  });

  describe('GasReducer()', function () {
    it('should initialize state', function () {
      assert.deepEqual(initState, {
        customData: { price: null, limit: null },
        basicEstimates: {
          safeLow: null,
          average: null,
          fast: null,
        },
        basicEstimateIsLoading: true,
      });
    });

    it('should return state unchanged if it does not match a dispatched actions type', function () {
      assert.deepEqual(
        GasReducer({ mockProp: 123 }, { type: 'someOtherAction' }),
        { mockProp: 123 },
      );
    });

    it('should track whether basic estimates are loading', function () {
      assert.equal(
        GasReducer(initState, basicGasEstimatesLoadingStarted())
          .basicEstimateIsLoading,
        true,
      );
      assert.equal(
        GasReducer(initState, basicGasEstimatesLoadingFinished())
          .basicEstimateIsLoading,
        false,
      );
    });

    it('should set basic estimates', function () {
      const basicEstimates = { safeLow: 1, average: 2, fast: 3 };
      assert.deepEqual(
        GasReducer(initState, setBasicGasEstimateData(basicEstimates))
          .basicEstimates,
        basicEstimates,
      );
    });

    it('should set and reset custom gas data', function () {
      let state = GasReducer(initState, setCustomGasPrice('0x10'));
      state = GasReducer(state, setCustomGasLimit('0x5208'));
      assert.deepEqual(state.customData, { price: '0x10', limit: '0x5208' });
      assert.deepEqual(GasReducer(state, resetCustomData()).customData, {
        price: null,
        limit: null,
      });
    });
  });

  describe('fetchBasicGasEstimates', function () {
    it('derives slow, average and fast prices from eth_gasPrice', async function () {
      // 20 GWEI
      stubNetwork({ gasPrice: '0x4a817c800' });
      const dispatch = sinon.spy();

      const estimates = await fetchBasicGasEstimates()(dispatch);

      assert.deepEqual(estimates, {
        safeLow: 18,
        average: 20,
        fast: 25,
      });
      assert.deepEqual(
        dispatch.getCall(0).args[0],
        basicGasEstimatesLoadingStarted(),
      );
      assert.deepEqual(
        dispatch.getCall(1).args[0],
        setBasicGasEstimateData(estimates),
      );
      assert.deepEqual(
        dispatch.getCall(2).args[0],
        basicGasEstimatesLoadingFinished(),
      );
    });

    it('never suggests a slow price below the latest base fee', async function () {
      // eth_gasPrice 20 GWEI, base fee 19.5 GWEI
      stubNetwork({ gasPrice: '0x4a817c800', baseFeePerGas: '0x48a4a6300' });
      const estimates = await fetchBasicGasEstimates()(sinon.spy());
      assert.equal(estimates.safeLow, 19.5);
      assert.equal(estimates.average, 20);
    });

    it('keeps average above slow when the suggestion is the base fee', async function () {
      // eth_gasPrice and base fee both 16 GWEI
      stubNetwork({ gasPrice: '0x3b9aca000', baseFeePerGas: '0x3b9aca000' });
      const estimates = await fetchBasicGasEstimates()(sinon.spy());
      assert.deepEqual(estimates, {
        safeLow: 16,
        average: 18,
        fast: 22.5,
      });
    });

    it('keeps fractions of a GWEI', async function () {
      // 1.5 GWEI
      stubNetwork({ gasPrice: '0x59682f00' });
      const estimates = await fetchBasicGasEstimates()(sinon.spy());
      assert.deepEqual(estimates, {
        safeLow: 1.35,
        average: 1.5,
        fast: 1.875,
      });
    });

    it('warns and finishes loading without estimates when the network fails', async function () {
      stubNetwork({ gasPriceError: new Error('offline') });
      const dispatch = sinon.spy();

      const estimates = await fetchBasicGasEstimates()(dispatch);

      assert.deepEqual(estimates, initState.basicEstimates);
      const actions = dispatch.getCalls().map((call) => call.args[0]);
      assert.ok(
        actions.some(
          (action) =>
            action.value ===
            'Unable to fetch gas estimates. Check your network connection.',
        ),
      );
      assert.deepEqual(
        actions[actions.length - 1],
        basicGasEstimatesLoadingFinished(),
      );
    });

    it('rejects a malformed gas price', async function () {
      stubNetwork({ gasPrice: '<html>' });
      const estimates = await fetchBasicGasEstimates()(sinon.spy());
      assert.deepEqual(estimates, initState.basicEstimates);
    });
  });

  describe('setCustomGasPriceForRetry', function () {
    it('uses the fast estimate when the transaction had no gas price', function () {
      const dispatch = sinon.spy();
      const getState = () => ({ gas: { basicEstimates: { fast: 25 } } });
      setCustomGasPriceForRetry('0x0')(dispatch, getState);
      assert.deepEqual(
        dispatch.getCall(0).args[0],
        setCustomGasPrice('5d21dba00'),
      );
    });

    it('uses the given price otherwise', function () {
      const dispatch = sinon.spy();
      setCustomGasPriceForRetry('0x10')(dispatch, () => ({}));
      assert.deepEqual(dispatch.getCall(0).args[0], setCustomGasPrice('0x10'));
    });
  });
});
