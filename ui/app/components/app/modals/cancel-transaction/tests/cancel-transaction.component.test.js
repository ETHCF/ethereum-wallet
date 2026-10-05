import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import Modal from '../../../modal';
import CancelTransaction from '../cancel-transaction.component';

describe('CancelTransaction Component', function () {
  const t = (key) => key;

  it('should pass the correct props to the Modal component', async function () {
    const createCancelTransactionSpy = sinon
      .stub()
      .callsFake(() => Promise.resolve());
    const hideModalSpy = sinon.spy();

    const wrapper = shallow(
      <CancelTransaction
        defaultNewGasPrice="0x3b9aca00"
        createCancelTransaction={createCancelTransactionSpy}
        hideModal={hideModalSpy}
        showTransactionConfirmedModal={() => undefined}
      />,
      { context: { t } },
    );

    assert.equal(wrapper.find(Modal).length, 1);
    const modalProps = wrapper.find(Modal).props();

    assert.equal(modalProps.headerText, 'attemptToCancel');
    assert.equal(modalProps.submitText, 'yesLetsTry');
    assert.equal(modalProps.cancelText, 'nevermind');

    assert.equal(createCancelTransactionSpy.callCount, 0);
    assert.equal(hideModalSpy.callCount, 0);
    await modalProps.onSubmit();
    assert.equal(createCancelTransactionSpy.callCount, 1);
    assert.equal(hideModalSpy.callCount, 1);
    modalProps.onCancel();
    assert.equal(hideModalSpy.callCount, 2);
  });
});
