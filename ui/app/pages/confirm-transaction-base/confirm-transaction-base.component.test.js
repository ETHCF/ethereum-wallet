import assert from 'assert';

import ConfirmTransactionBase from './confirm-transaction-base.component';

describe('ConfirmTransactionBase', function () {
  const getErrorKey = (props) =>
    ConfirmTransactionBase.prototype.getErrorKey.call({
      state: {},
      props: {
        customGas: { gasLimit: '5208' },
        txData: { txParams: {} },
        ...props,
      },
    });

  it('cannot be confirmed when the transaction is missing', function () {
    assert.equal(getErrorKey({ transactionMissing: true }).valid, false);
  });

  it('can be confirmed when the transaction is waiting', function () {
    assert.equal(getErrorKey({ transactionMissing: false }).valid, true);
  });
});
