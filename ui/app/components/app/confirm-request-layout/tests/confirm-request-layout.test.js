import assert from 'assert';
import React, { act } from 'react';
import { Route, Routes } from 'react-router-dom';
import configureMockStore from 'redux-mock-store';
import sinon from 'sinon';

import ConfirmRequestLayout, {
  RequestOrigin,
  mapConfirmRequestStateToProps,
} from '..';
import * as util from '../../../../../../app/scripts/lib/util';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';
import { clearConfirmTransaction } from '../../../../ducks/confirm-transaction/confirm-transaction.duck';

const ADDRESS = '0xd8f6a2ffb0fc5952d16c9768b71cfd35b6399aa5';

const state = {
  ecfWallet: {
    network: '1',
    provider: { type: 'mainnet', ticker: 'ETH' },
    selectedAddress: ADDRESS,
    identities: { [ADDRESS]: { address: ADDRESS, name: 'Account 1' } },
    accounts: { [ADDRESS]: { address: ADDRESS, balance: '0xde0b6b3a7640000' } },
    cachedBalances: {},
    domainMetadata: { 'https://example.com': { name: 'Example' } },
  },
  confirmTransaction: { txData: { id: 1 } },
  history: { mostRecentOverviewPage: '/overview' },
};

const flush = () => act(() => new Promise((resolve) => setImmediate(resolve)));

describe('confirm-request-layout', function () {
  describe('ConfirmRequestLayout', function () {
    let store;
    let props;

    const mountLayout = (extraProps = {}) =>
      mountWithRouter(
        <Routes>
          <Route
            path="/"
            element={
              <ConfirmRequestLayout {...props} {...extraProps}>
                <div className="test-body">body</div>
              </ConfirmRequestLayout>
            }
          />
          <Route path="/overview" element={<div className="test-overview" />} />
        </Routes>,
        store,
      );

    beforeEach(function () {
      store = configureMockStore()(state);
      props = {
        title: 'Request title',
        fromAddress: ADDRESS,
        onCancel: sinon.stub().resolves(),
        onConfirm: sinon.stub().resolves(),
        confirmText: 'Confirm',
      };
    });

    afterEach(function () {
      sinon.restore();
    });

    it('shows the title, account, balance and body', function () {
      const wrapper = mountLayout();
      assert.equal(
        wrapper.find('.confirm-request-layout__header__text').text(),
        'Request title',
      );
      assert.equal(
        wrapper.find('.account-list-item__account-name').text(),
        'Account 1',
      );
      assert.equal(
        wrapper.find('.confirm-request-layout__balance-value').text(),
        '1 ETH',
      );
      assert.equal(wrapper.find('.test-body').length, 1);
    });

    it('confirms, clears the request and returns to the overview', async function () {
      const wrapper = mountLayout();
      wrapper
        .find('button.confirm-request-layout__footer__confirm-button')
        .simulate('click');
      await flush();
      wrapper.update();

      assert(props.onConfirm.calledOnce);
      assert(props.onCancel.notCalled);
      assert.deepEqual(store.getActions(), [clearConfirmTransaction()]);
      assert.equal(wrapper.find('.test-overview').length, 1);
    });

    it('cancels, clears the request and returns to the overview', async function () {
      const wrapper = mountLayout({
        cancelButtonClassName: 'page__cancel',
      });
      wrapper.find('button.page__cancel').simulate('click');
      await flush();
      wrapper.update();

      assert(props.onCancel.calledOnce);
      assert(props.onConfirm.notCalled);
      assert.deepEqual(store.getActions(), [clearConfirmTransaction()]);
      assert.equal(wrapper.find('.test-overview').length, 1);
    });

    it('disables the confirm button and sets its test id', function () {
      const wrapper = mountLayout({
        confirmDisabled: true,
        confirmButtonTestId: 'page__confirm',
      });
      const button = wrapper.find('button[data-testid="page__confirm"]');
      assert.equal(button.prop('disabled'), true);
    });

    describe('in the notification popup', function () {
      beforeEach(function () {
        sinon.stub(util, 'getEnvironmentType').returns('notification');
      });

      it('cancels the request when the popup closes', async function () {
        const wrapper = mountLayout();
        window.dispatchEvent(new window.Event('beforeunload'));
        await flush();

        assert(props.onCancel.calledOnce);
        assert.deepEqual(store.getActions(), [clearConfirmTransaction()]);
        wrapper.unmount();
      });

      it('stops listening for the close once a button is pressed', async function () {
        const wrapper = mountLayout();
        wrapper
          .find('button.confirm-request-layout__footer__confirm-button')
          .simulate('click');
        await flush();
        window.dispatchEvent(new window.Event('beforeunload'));
        await flush();

        assert(props.onCancel.notCalled);
        wrapper.unmount();
      });

      it('stops listening for the close when unmounted', async function () {
        const wrapper = mountLayout();
        wrapper.unmount();
        window.dispatchEvent(new window.Event('beforeunload'));
        await flush();

        assert(props.onCancel.notCalled);
      });
    });
  });

  describe('RequestOrigin', function () {
    it("shows the site's icon", function () {
      const wrapper = mountWithRouter(
        <RequestOrigin origin={{ name: 'Example', icon: 'icon.png' }}>
          notice
        </RequestOrigin>,
      );
      assert.equal(
        wrapper.find('img.confirm-request-layout__origin-icon').prop('src'),
        'icon.png',
      );
      assert(wrapper.text().includes('notice'));
    });

    it("shows the site's initial when it has no icon", function () {
      const wrapper = mountWithRouter(
        <RequestOrigin origin={{ name: 'example' }}>notice</RequestOrigin>,
      );
      assert.equal(
        wrapper.find('.confirm-request-layout__origin-icon--default').text(),
        'E',
      );
    });
  });

  describe('mapConfirmRequestStateToProps', function () {
    it('maps the pending request and the sites metadata', function () {
      assert.deepEqual(mapConfirmRequestStateToProps(state), {
        txData: state.confirmTransaction.txData,
        domainMetadata: state.ecfWallet.domainMetadata,
      });
    });
  });
});
