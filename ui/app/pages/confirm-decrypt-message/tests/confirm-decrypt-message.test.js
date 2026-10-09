import assert from 'assert';
import React, { act } from 'react';
import configureMockStore from 'redux-mock-store';
import sinon from 'sinon';

import { mountWithRouter } from '../../../../../test/lib/render-helpers';
import ConfirmDecryptMessage from '../confirm-decrypt-message.component';

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

describe('ConfirmDecryptMessage', function () {
  const txData = {
    id: 1,
    msgParams: {
      from: ADDRESS,
      origin: 'https://example.com',
      data: 'ciphertext',
    },
  };

  const mountPage = (decryptMessageInline) =>
    mountWithRouter(
      <ConfirmDecryptMessage
        txData={txData}
        domainMetadata={{
          'https://example.com': { name: 'Example', icon: 'icon.png' },
        }}
        decryptMessage={sinon.stub().resolves()}
        cancelDecryptMessage={sinon.stub().resolves()}
        decryptMessageInline={decryptMessageInline}
      />,
      store,
    );

  it('shows the encrypted message until it is decrypted inline', async function () {
    const wrapper = mountPage(sinon.stub().resolves({ rawData: 'plaintext' }));
    const text = () =>
      wrapper.find('.request-decrypt-message__message-text').text();

    assert.equal(text(), 'ciphertext');
    assert.equal(
      wrapper.find('.request-decrypt-message__message-copy').length,
      0,
    );

    wrapper.find('.request-decrypt-message__message-lock').simulate('click');
    await flush();
    wrapper.update();

    assert.equal(text(), 'plaintext');
    assert.equal(
      wrapper.find('.request-decrypt-message__message-copy').length,
      1,
    );
    assert.equal(
      wrapper.find('.request-decrypt-message__message-lock--pressed').length,
      2,
    );
  });

  it('shows the error when inline decryption fails', async function () {
    const wrapper = mountPage(sinon.stub().resolves({ error: 'bad key' }));

    wrapper.find('.request-decrypt-message__message-lock').simulate('click');
    await flush();
    wrapper.update();

    assert.equal(
      wrapper.find('.request-decrypt-message__message-text').text(),
      '[decryptInlineError]',
    );
    assert.equal(
      wrapper.find('.request-decrypt-message__message-copy').length,
      0,
    );
  });
});
