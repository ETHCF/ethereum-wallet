import assert from 'assert';
import proxyquire from 'proxyquire';
import React from 'react';
import configureMockStore from 'redux-mock-store';

import { mountWithRouter } from '../../../../../test/lib/render-helpers';

const Content = () => null;

const { default: ConfirmApprove } = proxyquire('../confirm-approve.js', {
  './confirm-approve-content': {
    __esModule: true,
    default: Content,
    '@noCallThru': true,
  },
  '../confirm-transaction-base': {
    __esModule: true,
    default: ({ contentComponent }) => contentComponent,
    '@noCallThru': true,
  },
  '../../hooks/useI18nContext': { useI18nContext: () => (key) => key },
  '../../hooks/useTokenDetails': {
    useTokenDetails: () => ({ symbol: 'TST', decimals: 18 }),
  },
  '../../hooks/useTokenTracker': {
    useTokenTracker: () => ({ tokensWithBalances: [] }),
  },
});

describe('ConfirmApprove', function () {
  const approval = {
    id: 7,
    origin: 'https://dapp.example',
    txParams: {
      to: '0x1111111111111111111111111111111111111111',
      data: `0x095ea7b3${'3'.repeat(64)}${'0'.repeat(63)}a`,
      value: '0x4563918244f40000',
      gas: '0x0',
      gasPrice: '0x0',
    },
  };

  const render = (unapprovedTxs) => {
    const store = configureMockStore()({
      confirmTransaction: { txData: approval },
      ecfWallet: {
        nativeCurrency: 'ETH',
        currentNetworkTxList: [],
        domainMetadata: {},
        unapprovedTxs,
      },
    });
    return mountWithRouter(<ConfirmApprove />, store)
      .find(Content)
      .props();
  };

  it('uses a pending transaction that is not in the capped list', function () {
    const { ethTransactionTotal, origin } = render({ 7: approval });
    assert.equal(ethTransactionTotal, '5');
    assert.equal(origin, 'Https://dapp.example');
  });

  it('shows no total rather than zero when the transaction is missing', function () {
    assert.equal(render({}).ethTransactionTotal, undefined);
  });
});
