import { fireEvent } from '@testing-library/react';
import assert from 'assert';
import React from 'react';
import configureMockStore from 'redux-mock-store';

import NetworkConnectionBanner from '..';
import { renderWithProvider } from '../../../../../../test/lib/render-helpers';
import { NETWORK_DROPDOWN_OPEN } from '../../../../store/actionConstants';

describe('Network Connection Banner', function () {
  function renderBanner(network, showAfterMs = 0) {
    const store = configureMockStore()({
      ecfWallet: { network, provider: { type: 'mainnet' } },
      localeMessages: {},
    });
    return {
      store,
      ...renderWithProvider(
        <NetworkConnectionBanner showAfterMs={showAfterMs} />,
        store,
      ),
    };
  }

  it('shows nothing while the network is reachable', function () {
    const { queryByRole } = renderBanner('1');
    assert.equal(queryByRole('status'), null);
  });

  it('waits before saying the network cannot be reached', function () {
    const { queryByRole } = renderBanner('loading', 60000);
    assert.equal(queryByRole('status'), null);
  });

  it('says the network cannot be reached, without covering the page', async function () {
    const { findByRole, store } = renderBanner('loading');
    const banner = await findByRole('status');
    fireEvent.click(banner.querySelector('button'));
    assert.deepEqual(store.getActions(), [{ type: NETWORK_DROPDOWN_OPEN }]);
  });
});
