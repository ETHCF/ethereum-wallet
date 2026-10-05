import assert from 'assert';
import React from 'react';
import sinon from 'sinon';

import EndOfFlowScreen from '..';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';
import { DEFAULT_ROUTE } from '../../../../helpers/constants/routes';

describe('End of Flow Screen', function () {
  const props = {
    navigate: sinon.spy(),
  };

  it('should navigate to the default route on click', function (done) {
    const wrapper = mountWithRouter(
      <EndOfFlowScreen.WrappedComponent {...props} />,
    );
    const endOfFlowButton = wrapper.find(
      '.btn-primary.first-time-flow__button',
    );
    endOfFlowButton.simulate('click');

    setImmediate(() => {
      assert(props.navigate.calledOnceWithExactly(DEFAULT_ROUTE));
      done();
    });
  });
});
