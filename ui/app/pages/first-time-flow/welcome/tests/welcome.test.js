import assert from 'assert';
import React from 'react';
import configureMockStore from 'redux-mock-store';
import sinon from 'sinon';

import Welcome from '..';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';

describe('Welcome', function () {
  const mockStore = {
    ecfWallet: {},
  };

  const store = configureMockStore()(mockStore);

  it('routes to select action for a new user', function () {
    const props = {
      navigate: sinon.spy(),
    };

    const wrapper = mountWithRouter(
      <Welcome.WrappedComponent {...props} />,
      store,
    );

    const getStartedButton = wrapper.find(
      '.btn-primary.first-time-flow__button',
    );
    getStartedButton.simulate('click');
    assert.equal(
      props.navigate.getCall(0).args[0],
      '/initialize/select-action',
    );
  });
});
