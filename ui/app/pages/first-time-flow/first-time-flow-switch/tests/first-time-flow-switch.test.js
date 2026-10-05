import assert from 'assert';
import React from 'react';

import FirstTimeFlowSwitch from '..';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';
import {
  DEFAULT_ROUTE,
  LOCK_ROUTE,
  INITIALIZE_WELCOME_ROUTE,
  INITIALIZE_UNLOCK_ROUTE,
} from '../../../../helpers/constants/routes';

describe('FirstTimeFlowSwitch', function () {
  it('redirects to /welcome route with no props', function () {
    const wrapper = mountWithRouter(<FirstTimeFlowSwitch.WrappedComponent />);
    assert.equal(
      wrapper.find('Navigate').filter({ to: INITIALIZE_WELCOME_ROUTE }).length,
      1,
    );
  });

  it('redirects to / route when completedOnboarding is true', function () {
    const props = {
      completedOnboarding: true,
    };
    const wrapper = mountWithRouter(
      <FirstTimeFlowSwitch.WrappedComponent {...props} />,
    );

    assert.equal(
      wrapper.find('Navigate').filter({ to: DEFAULT_ROUTE }).length,
      1,
    );
  });

  it('redirects to /lock route when isUnlocked is true ', function () {
    const props = {
      completedOnboarding: false,
      isUnlocked: true,
    };

    const wrapper = mountWithRouter(
      <FirstTimeFlowSwitch.WrappedComponent {...props} />,
    );

    assert.equal(wrapper.find('Navigate').filter({ to: LOCK_ROUTE }).length, 1);
  });

  it('redirects to /unlock route when isInitialized is true', function () {
    const props = {
      completedOnboarding: false,
      isUnlocked: false,
      isInitialized: true,
    };

    const wrapper = mountWithRouter(
      <FirstTimeFlowSwitch.WrappedComponent {...props} />,
    );

    assert.equal(
      wrapper.find('Navigate').filter({ to: INITIALIZE_UNLOCK_ROUTE }).length,
      1,
    );
  });
});
