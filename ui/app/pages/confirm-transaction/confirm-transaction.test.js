import assert from 'assert';
import sinon from 'sinon';

import ConfirmTransaction from './confirm-transaction.component';

describe('Confirmation initialization', function () {
  function createConfirmation(transaction) {
    const props = {
      totalUnapprovedCount: 1,
      transaction,
      transactionId: '1',
      paramsTransactionId: '1',
      fetchBasicGasEstimates: sinon.spy(),
      getContractMethodData: sinon.spy(),
      setTransactionToConfirm: sinon.spy(),
    };
    return { props, component: new ConfirmTransaction(props) };
  }

  it('does not fetch gas or contract data for a message signature', function () {
    const { props, component } = createConfirmation({
      msgParams: { data: '0x1234' },
    });
    component.componentDidMount();
    assert.ok(props.fetchBasicGasEstimates.notCalled);
    assert.ok(props.getContractMethodData.notCalled);
    assert.ok(props.setTransactionToConfirm.calledOnceWith('1'));
  });

  it('fetches gas estimates for a transaction', function () {
    const { props, component } = createConfirmation({
      txParams: { data: '0x1234' },
    });
    component.componentDidMount();
    assert.ok(props.fetchBasicGasEstimates.calledOnce);
    assert.ok(props.getContractMethodData.calledOnceWith('0x1234'));
  });
});
