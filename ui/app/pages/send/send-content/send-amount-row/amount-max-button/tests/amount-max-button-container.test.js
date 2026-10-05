import assert from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

let mapDispatchToProps;

const actionSpies = {
  updateSendAmount: sinon.spy(),
};
const duckActionSpies = {
  updateSendErrors: sinon.spy(),
};

proxyquire('../amount-max-button.container.js', {
  'react-redux': {
    connect: (_, md) => {
      mapDispatchToProps = md;
      return () => ({});
    },
  },
  './amount-max-button.utils.js': {
    calcMaxAmount: (mockObj) => mockObj.val + 1,
  },
  '../../../../../store/actions': actionSpies,
  '../../../../../ducks/send/send.duck': duckActionSpies,
});

describe('amount-max-button container', function () {
  describe('mapDispatchToProps()', function () {
    let dispatchSpy;
    let mapDispatchToPropsObject;

    beforeEach(function () {
      dispatchSpy = sinon.spy();
      mapDispatchToPropsObject = mapDispatchToProps(dispatchSpy);
    });

    describe('setAmountToMax()', function () {
      it('should dispatch an action', function () {
        mapDispatchToPropsObject.setAmountToMax({ val: 11, foo: 'bar' });
        assert(dispatchSpy.calledTwice);
        assert(duckActionSpies.updateSendErrors.calledOnce);
        assert.deepEqual(duckActionSpies.updateSendErrors.getCall(0).args[0], {
          amount: null,
        });
        assert(actionSpies.updateSendAmount.calledOnce);
        assert.equal(actionSpies.updateSendAmount.getCall(0).args[0], 12);
      });
    });
  });
});
