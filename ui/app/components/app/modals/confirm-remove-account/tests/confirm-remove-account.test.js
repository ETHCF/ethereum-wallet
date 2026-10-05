import assert from 'assert';
import { mount } from 'enzyme';
import PropTypes from 'prop-types';
import React from 'react';
import { Provider } from 'react-redux';
import createMockStore from 'redux-mock-store';
import sinon from 'sinon';

import ConfirmRemoveAccount from '..';

describe('Confirm Remove Account', function () {
  let wrapper;

  const state = {
    ecfWallet: {},
  };

  const props = {
    hideModal: sinon.spy(),
    removeAccount: sinon.stub().resolves(),
    network: '101',
    identity: {
      address: '0xAddress',
      name: 'Account 1',
    },
  };

  const mockStore = createMockStore();
  const store = mockStore(state);

  beforeEach(function () {
    wrapper = mount(
      <Provider store={store}>
        <ConfirmRemoveAccount.WrappedComponent {...props} />
      </Provider>,
      {
        context: {
          t: (str) => str,
          store,
        },
        childContextTypes: {
          t: PropTypes.func,
          store: PropTypes.object,
        },
      },
    );
  });

  afterEach(function () {
    props.hideModal.resetHistory();
  });

  it('nevermind', function () {
    const nevermind = wrapper.find({ type: 'default' });
    nevermind.simulate('click');

    assert(props.hideModal.calledOnce);
  });

  it('remove', function (done) {
    const remove = wrapper.find({ type: 'secondary' });
    remove.simulate('click');

    assert(props.removeAccount.calledOnce);
    assert.equal(
      props.removeAccount.getCall(0).args[0],
      props.identity.address,
    );

    setImmediate(() => {
      assert(props.hideModal.calledOnce);
      done();
    });
  });

  it('closes', function () {
    const close = wrapper.find('.modal-container__header-close');
    close.simulate('click');

    assert(props.hideModal.calledOnce);
  });
});
