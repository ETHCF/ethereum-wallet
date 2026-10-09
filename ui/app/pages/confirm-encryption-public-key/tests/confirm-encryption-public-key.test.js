import assert from 'assert';
import React, { act } from 'react';
import configureMockStore from 'redux-mock-store';
import sinon from 'sinon';

import { mountWithRouter } from '../../../../../test/lib/render-helpers';
import ConfirmEncryptionPublicKey from '../confirm-encryption-public-key.component';

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

describe('ConfirmEncryptionPublicKey', function () {
  it("shows the requesting site and account, and provides the account's key", async function () {
    const txData = { id: 1, origin: 'https://example.com', msgParams: ADDRESS };
    const encryptionPublicKey = sinon.stub().resolves();
    const wrapper = mountWithRouter(
      <ConfirmEncryptionPublicKey
        txData={txData}
        domainMetadata={{ 'https://example.com': { name: 'example' } }}
        encryptionPublicKey={encryptionPublicKey}
        cancelEncryptionPublicKey={sinon.stub().resolves()}
      />,
      store,
    );

    assert.equal(
      wrapper.find('.confirm-request-layout__origin-icon--default').text(),
      'E',
    );
    assert.equal(
      wrapper.find('.request-encryption-public-key__notice').length,
      1,
    );
    assert.equal(
      wrapper.find('.account-list-item__account-name').text(),
      'Account 1',
    );

    wrapper
      .find('button.confirm-request-layout__footer__confirm-button')
      .simulate('click');
    await flush();
    assert(encryptionPublicKey.calledOnceWith(txData));
  });
});
