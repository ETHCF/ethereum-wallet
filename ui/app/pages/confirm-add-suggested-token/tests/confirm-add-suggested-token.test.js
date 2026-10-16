import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import ConfirmAddSuggestedToken from '../confirm-add-suggested-token.component';

describe('ConfirmAddSuggestedToken', function () {
  const suggestion = {
    id: 'request-1',
    origin: 'https://dapp.test',
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

  it('declines or adds that one suggestion', function () {
    const { wrapper, acceptWatchAsset, rejectWatchAsset } = render();
    wrapper.find('[data-testid="suggested-token-cancel"]').simulate('click');
    assert.deepEqual(rejectWatchAsset.firstCall.args, ['request-1']);
    wrapper.find('[data-testid="suggested-token-add"]').simulate('click');
    assert.deepEqual(acceptWatchAsset.firstCall.args, ['request-1']);
  });

  it('warns when the symbol belongs to another added token', function () {
    const { wrapper } = render({
      tokens: [{ address: '0xother', symbol: 'ABC', decimals: 18 }],
    });
    assert.equal(wrapper.find('.warning').text(), 'reusedTokenNameWarning');
  });
});
