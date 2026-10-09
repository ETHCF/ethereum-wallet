import assert from 'assert';
import React, { act } from 'react';
import configureMockStore from 'redux-mock-store';
import sinon from 'sinon';

import SignatureRequestOriginal from '..';
import { MESSAGE_TYPE } from '../../../../../../app/scripts/lib/enums';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';

const ADDRESS = '0xd8f6a2ffb0fc5952d16c9768b71cfd35b6399aa5';

const store = configureMockStore()({
  ecfWallet: {
    network: '1',
    provider: { type: 'mainnet', ticker: 'ETH' },
    selectedAddress: ADDRESS,
    identities: { [ADDRESS]: { address: ADDRESS, name: 'Account 1' } },
    accounts: { [ADDRESS]: { address: ADDRESS, balance: '0x0' } },
    cachedBalances: {},
  },
  history: { mostRecentOverviewPage: '/' },
});

const flush = () => act(() => new Promise((resolve) => setImmediate(resolve)));

describe('SignatureRequestOriginal', function () {
  let handlers;

  const mountRequest = (type, msgParams) =>
    mountWithRouter(
      <SignatureRequestOriginal
        txData={{ id: 1, type, msgParams: { from: ADDRESS, ...msgParams } }}
        {...handlers}
      />,
      store,
    );

  beforeEach(function () {
    handlers = {
      signPersonalMessage: sinon.stub().resolves(),
      signTypedMessage: sinon.stub().resolves(),
      cancelPersonalMessage: sinon.stub().resolves(),
      cancelTypedMessage: sinon.stub().resolves(),
    };
  });

  it('shows a personal message as text and signs it', async function () {
    const wrapper = mountRequest(MESSAGE_TYPE.PERSONAL_SIGN, {
      data: '0x68656c6c6f',
    });
    assert.equal(wrapper.find('.request-signature__row-value').text(), 'hello');

    wrapper
      .find('[data-testid="request-signature__sign"]')
      .hostNodes()
      .simulate('click');
    await flush();
    assert(handlers.signPersonalMessage.calledOnce);
    assert(handlers.signTypedMessage.notCalled);
  });

  it('shows typed data rows and cancels with the typed handler', async function () {
    const wrapper = mountRequest(MESSAGE_TYPE.ETH_SIGN_TYPED_DATA, {
      data: [
        { name: 'Greeting', value: 'hi' },
        { name: 'Flag', value: true },
      ],
    });
    const values = wrapper.find('.request-signature__row-value');
    assert.deepEqual(
      values.map((value) => value.text()),
      ['hi', 'true'],
    );

    wrapper
      .find('button.request-signature__footer__cancel-button')
      .simulate('click');
    await flush();
    assert(handlers.cancelTypedMessage.calledOnce);
    assert(handlers.cancelPersonalMessage.notCalled);
  });

  it('blocks signing a Sign-In with Ethereum message that has errors', function () {
    const wrapper = mountRequest(MESSAGE_TYPE.PERSONAL_SIGN, {
      data: '0x68656c6c6f',
      origin: 'https://example.com',
      siwe: { errors: ['Domain mismatch'] },
    });
    assert.equal(wrapper.find('[role="alert"]').text(), 'Domain mismatch');
    assert.equal(
      wrapper
        .find('button[data-testid="request-signature__sign"]')
        .prop('disabled'),
      true,
    );
  });
});
