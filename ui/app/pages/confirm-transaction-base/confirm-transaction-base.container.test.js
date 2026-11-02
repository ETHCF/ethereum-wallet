import assert from 'assert';
import proxyquire from 'proxyquire';

let mapStateToProps;

proxyquire('./confirm-transaction-base.container.js', {
  'react-redux': {
    connect: (ms) => {
      mapStateToProps = ms;
      return () => ({});
    },
  },
});

describe('ConfirmTransactionBase container', function () {
  const from = '0x1111111111111111111111111111111111111111';
  const to = '0x2222222222222222222222222222222222222222';
  const txParams = { from, to, gas: '0x5208', gasPrice: '0x1', value: '0x0' };

  const stateWith = (unapprovedTxs) => ({
    appState: {},
    confirmTransaction: { txData: { id: 7, txParams }, tokenProps: {} },
    history: { mostRecentOverviewPage: '/' },
    ecfWallet: {
      accounts: { [from]: { address: from, balance: '0x0' } },
      addressBook: {},
      assetImages: {},
      cachedBalances: {},
      ensResolutionsByAddress: {},
      identities: { [from]: { address: from, name: 'Account' } },
      network: '1',
      nativeCurrency: 'ETH',
      preferences: {},
      provider: { chainId: '0x1', type: 'mainnet' },
      selectedAddress: from,
      tokens: [],
      unapprovedTxs,
    },
    gas: { customData: {} },
  });

  it('reports a transaction that is no longer waiting', function () {
    const { transactionMissing } = mapStateToProps(stateWith({}), {
      params: { id: '7' },
    });
    assert.equal(transactionMissing, true);
  });

  it('finds a transaction that is waiting', function () {
    const { transactionMissing } = mapStateToProps(
      stateWith({ 7: { id: 7, txParams } }),
      { params: { id: '7' } },
    );
    assert.equal(transactionMissing, false);
  });
});
