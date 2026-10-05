import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import configureMockStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';

import Identicon from '../identicon.component';

describe('Identicon', function () {
  const state = {
    ecfWallet: {},
  };

  const middlewares = [thunk];
  const mockStore = configureMockStore(middlewares);
  const store = mockStore(state);

  it('renders default eth_logo identicon with no props', function () {
    const wrapper = mount(<Identicon store={store} />);

    assert.equal(
      wrapper.find('img.identicon__eth-logo').prop('src'),
      './images/eth_logo.svg',
    );
  });

  it('renders custom image and add className props', function () {
    const wrapper = mount(
      <Identicon store={store} className="test-image" image="test-image" />,
    );

    assert.equal(
      wrapper.find('img.test-image').prop('className'),
      'identicon test-image',
    );
    assert.equal(wrapper.find('img.test-image').prop('src'), 'test-image');
  });

  it('renders a monochrome identicon with address prop', function () {
    const wrapper = mount(
      <Identicon store={store} className="test-address" address="0xTest" />,
    );

    assert.equal(
      wrapper.find('svg.test-address').prop('className'),
      'identicon test-address',
    );
  });
});
