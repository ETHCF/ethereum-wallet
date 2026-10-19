import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import ConfirmAddSuggestedToken from '../confirm-add-suggested-token.component';

describe('ConfirmAddSuggestedToken', function () {
  const suggestion = {
    id: 'request-1',
    origin: 'https://dapp.test',
    chainId: '0xaa36a7',
    networkName: 'Sepolia',
    address: '0xd26114cd6ee289accf82350c8d8487fedb8a0c07',
    symbol: 'ABC',
    decimals: 8,
  };

  const render = (props = {}) => {
    const acceptWatchAsset = sinon.spy();
    const rejectWatchAsset = sinon.spy();
    const wrapper = shallow(
      <ConfirmAddSuggestedToken
        acceptWatchAsset={acceptWatchAsset}
        rejectWatchAsset={rejectWatchAsset}
        navigate={sinon.spy()}
        mostRecentOverviewPage="/"
        suggestion={suggestion}
        tokens={[]}
        {...props}
      />,
      { context: { t: (key, args = []) => [key, ...args].join(' ') } },
    );
    return { wrapper, acceptWatchAsset, rejectWatchAsset };
  };

  it('names the site that suggested the token', function () {
    const { wrapper } = render();
    assert.equal(
      wrapper.find('[data-testid="suggested-token-origin"]').text(),
      'siteSuggestsToken https://dapp.test',
    );
  });

  it('shows the network captured by the approval', function () {
    const { wrapper } = render();
    assert.equal(
      wrapper.find('[data-testid="suggested-token-network"]').text(),
      'network: Sepolia (11155111)',
    );
  });

  it('declines or adds that one suggestion', function () {
    const declined = render();
    declined.wrapper
      .find('[data-testid="suggested-token-cancel"]')
      .simulate('click');
    assert.deepEqual(declined.rejectWatchAsset.firstCall.args, ['request-1']);

    const added = render();
    added.wrapper.find('[data-testid="suggested-token-add"]').simulate('click');
    assert.deepEqual(added.acceptWatchAsset.firstCall.args, ['request-1']);
  });

  it('answers only once while the answer is in flight', async function () {
    let finish;
    const acceptWatchAsset = sinon.spy(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { wrapper, rejectWatchAsset } = render({ acceptWatchAsset });
    const add = () => wrapper.find('[data-testid="suggested-token-add"]');
    const cancel = () => wrapper.find('[data-testid="suggested-token-cancel"]');

    add().simulate('click');
    add().simulate('click');
    cancel().simulate('click');
    assert.equal(acceptWatchAsset.callCount, 1);
    assert.equal(rejectWatchAsset.called, false);
    assert.equal(add().prop('disabled'), true);
    assert.equal(cancel().prop('disabled'), true);

    // If the suggestion is still pending afterwards, it can be answered again.
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(add().prop('disabled'), false);
  });

  it('warns when the symbol belongs to another added token', function () {
    const { wrapper } = render({
      tokens: [{ address: '0xother', symbol: 'ABC', decimals: 18 }],
    });
    assert.equal(wrapper.find('.warning').text(), 'reusedTokenNameWarning');
  });

  it('warns when the symbol differs from an added token only in case or form', function () {
    for (const symbol of ['abc', 'AbC', '\uff21\uff22\uff23']) {
      const { wrapper } = render({
        tokens: [{ address: '0xother', symbol, decimals: 18 }],
      });
      assert.equal(
        wrapper.find('.warning').text(),
        'reusedTokenNameWarning',
        symbol,
      );
    }
  });
});
