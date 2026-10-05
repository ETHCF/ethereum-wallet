import assert from 'assert';
import React from 'react';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import sinon from 'sinon';

import AccountMenu from '..';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';

describe('Account Menu', function () {
  let wrapper;

  const mockStore = {
    ecfWallet: {
      provider: {
        type: 'test',
      },
      preferences: {
        useNativeCurrencyAsPrimaryCurrency: true,
      },
    },
  };

  const store = configureMockStore()(mockStore);

  const props = {
    isAccountMenuOpen: true,
    addressConnectedDomainMap: {},
    accounts: [
      {
        address: '0xAddress',
        name: 'Account 1',
        balance: '0x0',
      },
      {
        address: '0xImportedAddress',
        name: 'Imported Account 1',
        balance: '0x0',
      },
    ],
    keyrings: [
      {
        type: 'HD Key Tree',
        accounts: ['0xAdress'],
      },
      {
        type: 'Simple Key Pair',
        accounts: ['0xImportedAddress'],
      },
    ],
    prevIsAccountMenuOpen: false,
    lockEcfWallet: sinon.spy(),
    showAccountDetail: sinon.spy(),
    showRemoveAccountConfirmationModal: sinon.spy(),
    toggleAccountMenu: sinon.spy(),
    navigate: sinon.spy(),
  };

  before(function () {
    wrapper = mountWithRouter(
      <Provider store={store}>
        <AccountMenu.WrappedComponent {...props} />
      </Provider>,
      store,
    );
  });

  afterEach(function () {
    props.toggleAccountMenu.resetHistory();
    props.navigate.resetHistory();
  });

  describe('Render Content', function () {
    it('renders a name and balance for each account', function () {
      assert.equal(wrapper.find('.account-menu__name').length, 2);
      assert.equal(
        wrapper.find('.currency-display-component.account-menu__balance')
          .length,
        2,
      );
    });

    it('simulate click', function () {
      const click = wrapper.find(
        '.account-menu__account.menu__item--clickable',
      );
      click.first().simulate('click');

      assert(props.showAccountDetail.calledOnce);
      assert.equal(props.showAccountDetail.getCall(0).args[0], '0xAddress');
    });

    it('render imported account label', function () {
      const importedAccount = wrapper.find('.keyring-label.allcaps');
      assert.equal(importedAccount.text(), 'imported');
    });
  });

  describe('Log Out', function () {
    it('simulate click', function () {
      wrapper.find('.account-menu__lock-button').simulate('click');
      assert(props.lockEcfWallet.calledOnce);
      assert.equal(props.navigate.getCall(0).args[0], '/');
    });
  });

  describe('Create Account', function () {
    it('calls toggle menu and push new-account route to history', function () {
      wrapper.find({ text: 'createAccount' }).simulate('click');
      assert(props.toggleAccountMenu.calledOnce);
      assert.equal(props.navigate.getCall(0).args[0], '/new-account');
    });
  });

  describe('Import Account', function () {
    it('calls toggle menu and push /new-account/import route to history', function () {
      wrapper.find({ text: 'importAccount' }).simulate('click');
      assert(props.toggleAccountMenu.calledOnce);
      assert.equal(props.navigate.getCall(0).args[0], '/new-account/import');
    });
  });

  describe('Connect Hardware Wallet', function () {
    it('calls toggle menu and push /new-account/connect route to history', function () {
      wrapper.find({ text: 'connectHardwareWallet' }).simulate('click');
      assert(props.toggleAccountMenu.calledOnce);
      assert.equal(props.navigate.getCall(0).args[0], '/new-account/connect');
    });
  });

  describe('Info & Help', function () {
    it('calls toggle menu and push /new-account/connect route to history', function () {
      wrapper.find({ text: 'infoHelp' }).simulate('click');
      assert(props.toggleAccountMenu.calledOnce);
      assert.equal(props.navigate.getCall(0).args[0], '/settings/about-us');
    });
  });

  describe('Settings', function () {
    it('calls toggle menu and push /new-account/connect route to history', function () {
      wrapper.find({ text: 'settings' }).simulate('click');
      assert(props.toggleAccountMenu.calledOnce);
      assert.equal(props.navigate.getCall(0).args[0], '/settings');
    });
  });
});
