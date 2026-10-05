import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import configureMockStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';
import sinon from 'sinon';

import TokenCell from '.';
import { ROUTER_FUTURE_FLAGS } from '../../../helpers/constants/router';
import Identicon from '../../ui/identicon';

describe('Token Cell', function () {
  let wrapper;

  const state = {
    ecfWallet: {
      currentCurrency: 'usd',
      selectedAddress: '0xAddress',
      conversionRate: 7.0,
      preferences: {},
      provider: {
        chainId: '1',
        ticker: 'ETH',
        type: 'mainnet',
      },
    },
    appState: {
      sidebar: {
        isOpen: true,
      },
    },
  };

  const middlewares = [thunk];
  const mockStore = configureMockStore(middlewares);
  const store = mockStore(state);

  let onClick;

  beforeEach(function () {
    onClick = sinon.stub();
    wrapper = mount(
      <Provider store={store}>
        <MemoryRouter future={ROUTER_FUTURE_FLAGS}>
          <TokenCell
            address="0xAnotherToken"
            symbol="TEST"
            string="5.000"
            currentCurrency="usd"
            image="./test-image"
            onClick={onClick}
          />
        </MemoryRouter>
      </Provider>,
    );
  });

  afterEach(function () {
    sinon.restore();
  });

  it('renders Identicon with props from token cell', function () {
    assert.equal(wrapper.find(Identicon).prop('address'), '0xAnotherToken');
    assert.equal(wrapper.find(Identicon).prop('image'), './test-image');
  });

  it('renders token balance and symbol', function () {
    assert.equal(wrapper.find('.list-item__heading').text(), '5.000 TEST');
  });

  it('calls onClick when clicked', function () {
    assert.ok(!onClick.called);
    wrapper.simulate('click');
    assert.ok(onClick.called);
  });
});
