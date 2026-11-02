import assert from 'assert';
import proxyquire from 'proxyquire';

let mapStateToProps;

proxyquire('../confirm-token-transaction-base.container.js', {
  'react-redux': {
    connect: (ms) => {
      mapStateToProps = ms;
      return () => ({});
    },
  },
});

describe('ConfirmTokenTransactionBase container', function () {
  const tokenTransfer = {
    id: 7,
    txParams: {
      to: '0x1111111111111111111111111111111111111111',
      data: `0xa9059cbb${'3'.repeat(64)}${'0'.repeat(63)}a`,
      value: '0x4563918244f40000',
      gas: '0x0',
      gasPrice: '0x0',
    },
  };

  const stateWith = (unapprovedTxs) => ({
    confirmTransaction: { txData: tokenTransfer },
    ecfWallet: {
      nativeCurrency: 'ETH',
      currentNetworkTxList: [],
      unapprovedTxs,
      provider: { chainId: '0x1' },
    },
  });

  it('totals a pending transaction that is not in the capped list', function () {
    const { ethTransactionTotal } = mapStateToProps(
      stateWith({ 7: tokenTransfer }),
      { params: { id: '7' } },
    );
    assert.equal(ethTransactionTotal, '5');
  });

  it('shows no total rather than zero when the transaction is missing', function () {
    const { ethTransactionTotal } = mapStateToProps(stateWith({}), {
      params: { id: '7' },
    });
    assert.equal(ethTransactionTotal, undefined);
  });
});
