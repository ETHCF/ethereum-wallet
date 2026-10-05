import assert from 'assert';
import proxyquire from 'proxyquire';

const {
  getRenderableBasicEstimateData,
  getRenderableEstimateDataForSmallButtonsFromGWEI,
} = proxyquire('../custom-gas', {});

describe('custom-gas selectors', function () {
  describe('getRenderableBasicEstimateData()', function () {
    const tests = [
      {
        expectedResult: [
          {
            gasEstimateType: 'SLOW',
            feeInPrimaryCurrency: '0.0000525 ETH',
            priceInHexWei: '0x9502f900',
          },
          {
            gasEstimateType: 'AVERAGE',
            feeInPrimaryCurrency: '0.000084 ETH',
            priceInHexWei: '0xee6b2800',
          },
          {
            gasEstimateType: 'FAST',
            feeInPrimaryCurrency: '0.000105 ETH',
            priceInHexWei: '0x12a05f200',
          },
        ],
        mockState: {
          ecfWallet: {
            provider: {
              type: 'mainnet',
            },
          },
          gas: {
            basicEstimates: {
              safeLow: 2.5,
              average: 4,
              fast: 5,
              fastest: 10,
            },
          },
        },
      },
      {
        expectedResult: [
          {
            gasEstimateType: 'SLOW',
            feeInPrimaryCurrency: '0.000105 ETH',
            priceInHexWei: '0x12a05f200',
          },
          {
            feeInPrimaryCurrency: '0.000147 ETH',
            gasEstimateType: 'AVERAGE',
            priceInHexWei: '0x1a13b8600',
          },
          {
            gasEstimateType: 'FAST',
            feeInPrimaryCurrency: '0.00021 ETH',
            priceInHexWei: '0x2540be400',
          },
        ],
        mockState: {
          ecfWallet: {
            send: {
              gasLimit: '0x5208',
            },
            provider: {
              type: 'mainnet',
            },
          },
          gas: {
            basicEstimates: {
              safeLow: 5,
              average: 7,
              fast: 10,
              fastest: 20,
            },
          },
        },
      },
      {
        expectedResult: [
          {
            gasEstimateType: 'SLOW',
            feeInPrimaryCurrency: '0.000105 ETH',
            priceInHexWei: '0x12a05f200',
          },
          {
            gasEstimateType: 'AVERAGE',
            feeInPrimaryCurrency: '0.000147 ETH',
            priceInHexWei: '0x1a13b8600',
          },
          {
            gasEstimateType: 'FAST',
            feeInPrimaryCurrency: '0.00021 ETH',
            priceInHexWei: '0x2540be400',
          },
        ],
        mockState: {
          ecfWallet: {
            send: {
              gasLimit: '0x5208',
            },
            provider: {
              type: 'rinkeby',
            },
          },
          gas: {
            basicEstimates: {
              safeLow: 5,
              average: 7,
              fast: 10,
              fastest: 20,
            },
          },
        },
      },
    ];

    it('should return renderable data about basic estimates', function () {
      tests.forEach((test) => {
        assert.deepEqual(
          getRenderableBasicEstimateData(test.mockState, '0x5208'),
          test.expectedResult,
        );
      });
    });
  });

  describe('getRenderableEstimateDataForSmallButtonsFromGWEI()', function () {
    const tests = [
      {
        expectedResult: [
          {
            feeInPrimaryCurrency: '0.00052 ETH',
            gasEstimateType: 'SLOW',
            priceInHexWei: '0x5d21dba00',
          },
          {
            feeInPrimaryCurrency: '0.00063 ETH',
            gasEstimateType: 'AVERAGE',
            priceInHexWei: '0x6fc23ac00',
          },
          {
            feeInPrimaryCurrency: '0.00105 ETH',
            gasEstimateType: 'FAST',
            priceInHexWei: '0xba43b7400',
          },
        ],
        mockState: {
          ecfWallet: {
            send: {
              gasLimit: '0x5208',
            },
            provider: {
              type: 'mainnet',
            },
          },
          gas: {
            basicEstimates: {
              safeLow: 25,
              average: 30,
              fast: 50,
              fastest: 100,
            },
          },
        },
      },
      {
        expectedResult: [
          {
            feeInPrimaryCurrency: '0.00105 ETH',
            gasEstimateType: 'SLOW',
            priceInHexWei: '0xba43b7400',
          },
          {
            feeInPrimaryCurrency: '0.00157 ETH',
            gasEstimateType: 'AVERAGE',
            priceInHexWei: '0x1176592e00',
          },
          {
            feeInPrimaryCurrency: '0.0021 ETH',
            gasEstimateType: 'FAST',
            priceInHexWei: '0x174876e800',
          },
        ],
        mockState: {
          ecfWallet: {
            send: {
              gasLimit: '0x5208',
            },
            provider: {
              type: 'mainnet',
            },
          },
          gas: {
            basicEstimates: {
              safeLow: 50,
              average: 75,
              fast: 100,
              fastest: 200,
            },
          },
        },
      },
      {
        expectedResult: [
          {
            feeInPrimaryCurrency: '0.00105 ETH',
            gasEstimateType: 'SLOW',
            priceInHexWei: '0xba43b7400',
          },
          {
            feeInPrimaryCurrency: '0.00157 ETH',
            gasEstimateType: 'AVERAGE',
            priceInHexWei: '0x1176592e00',
          },
          {
            feeInPrimaryCurrency: '0.0021 ETH',
            gasEstimateType: 'FAST',
            priceInHexWei: '0x174876e800',
          },
        ],
        mockState: {
          ecfWallet: {
            send: {
              gasLimit: '0x5208',
            },
            provider: {
              type: 'rinkeby',
            },
          },
          gas: {
            basicEstimates: {
              safeLow: 50,
              average: 75,
              fast: 100,
              fastest: 200,
            },
          },
        },
      },
    ];

    it('should return renderable data about basic estimates appropriate for buttons with less info', function () {
      tests.forEach((test) => {
        assert.deepEqual(
          getRenderableEstimateDataForSmallButtonsFromGWEI(test.mockState),
          test.expectedResult,
        );
      });
    });
  });
});
