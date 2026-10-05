import assert from 'assert';
import proxyquire from 'proxyquire';

let mapStateToProps;

proxyquire('../transaction-activity-log.container.js', {
  'react-redux': {
    connect: (ms) => {
      mapStateToProps = ms;
      return () => ({});
    },
  },
});

describe('TransactionActivityLog container', function () {
  describe('mapStateToProps()', function () {
    it('should return the correct props', function () {
      const mockState = {
        ecfWallet: {
          provider: {
            ticker: 'ETH',
          },
        },
      };

      assert.deepEqual(mapStateToProps(mockState), { nativeCurrency: 'ETH' });
    });
  });
});
