import assert from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

let mapDispatchToProps;

const duckActionSpies = {
  updateSendErrors: sinon.spy(),
};

proxyquire('../send-amount-row.container.js', {
  'react-redux': {
    connect: (_, md) => {
      mapDispatchToProps = md;
      return () => ({});
    },
  },
  '../../../../selectors': { sendAmountIsInError: (s) => `mockInError:${s}` },
  '../../send.utils': {
    getAmountErrorObject: (mockDataObject) => ({
      ...mockDataObject,
      mockChange: true,
    }),
    getGasFeeErrorObject: (mockDataObject) => ({
      ...mockDataObject,
      mockGasFeeErrorChange: true,
    }),
  },
  '../../../../ducks/send/send.duck': duckActionSpies,
});

describe('send-amount-row container', function () {
  describe('mapDispatchToProps()', function () {
    let dispatchSpy;
    let mapDispatchToPropsObject;

    beforeEach(function () {
      dispatchSpy = sinon.spy();
      mapDispatchToPropsObject = mapDispatchToProps(dispatchSpy);
      duckActionSpies.updateSendErrors.resetHistory();
    });

    describe('updateGasFeeError()', function () {
      it('should dispatch an action', function () {
        mapDispatchToPropsObject.updateGasFeeError({ some: 'data' });
        assert(dispatchSpy.calledOnce);
        assert(duckActionSpies.updateSendErrors.calledOnce);
        assert.deepEqual(duckActionSpies.updateSendErrors.getCall(0).args[0], {
          some: 'data',
          mockGasFeeErrorChange: true,
        });
      });
    });

    describe('updateSendAmountError()', function () {
      it('should dispatch an action', function () {
        mapDispatchToPropsObject.updateSendAmountError({ some: 'data' });
        assert(dispatchSpy.calledOnce);
        assert(duckActionSpies.updateSendErrors.calledOnce);
        assert.deepEqual(duckActionSpies.updateSendErrors.getCall(0).args[0], {
          some: 'data',
          mockChange: true,
        });
      });
    });
  });
});
