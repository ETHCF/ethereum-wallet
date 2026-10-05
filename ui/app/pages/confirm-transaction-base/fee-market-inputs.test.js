import { strict as assert } from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import FeeMarketInputs from './fee-market-inputs';
import TextField from '../../components/ui/text-field';

describe('EIP-1559 fee editing', function () {
  it('converts Gwei exactly and prevents approving a cap below the priority fee', async function () {
    const onChange = sinon.spy();
    const onValidityChange = sinon.spy();
    const wrapper = shallow(
      <FeeMarketInputs
        params={{
          maxFeePerGas: '0x77359400',
          maxPriorityFeePerGas: '0x3b9aca00',
          gas: '0x5208',
        }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    wrapper.find(TextField).at(0).prop('onChange')({
      target: { value: '0.5' },
    });
    assert.equal(onChange.callCount, 0);
    assert.equal(onValidityChange.lastCall.args[0], false);
    assert.equal(wrapper.find('[role="alert"]').length, 1);
    wrapper.find(TextField).at(0).prop('onChange')({
      target: { value: '1.500000001' },
    });
    assert.equal(
      onValidityChange.lastCall.args[0],
      false,
      'approval waits for the fee update',
    );
    await Promise.resolve();
    assert.equal(onValidityChange.lastCall.args[0], true);
    assert.deepEqual(onChange.lastCall.args[0], {
      maxFeePerGas: '0x59682f01',
      maxPriorityFeePerGas: '0x3b9aca00',
      gasLimit: '0x5208',
    });
    wrapper.find(TextField).at(2).prop('onChange')({
      target: { value: '20000' },
    });
    assert.equal(onValidityChange.lastCall.args[0], false);
  });

  it('blocks approval when a field holds text that is not a plain number', async function () {
    const onChange = sinon.spy();
    const onValidityChange = sinon.spy();
    const wrapper = shallow(
      <FeeMarketInputs
        params={{
          maxFeePerGas: '0x5d21dba00',
          maxPriorityFeePerGas: '0x3b9aca00',
          gas: '0x5208',
        }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    );
    const maxFee = () => wrapper.find(TextField).at(0);
    // A valid fee is saved and approval allowed...
    maxFee().prop('onChange')({ target: { value: '2' } });
    await Promise.resolve();
    assert.equal(onValidityChange.lastCall.args[0], true);
    // ...then the user keeps typing, with a decimal comma, or clears the field.
    for (const value of ['2,', '2,5', '', ' ', '.', '1e9', '-2']) {
      const saves = onChange.callCount;
      assert.doesNotThrow(() =>
        maxFee().prop('onChange')({ target: { value } }),
      );
      await Promise.resolve();
      assert.equal(onValidityChange.lastCall.args[0], false, value);
      assert.equal(onChange.callCount, saves, `${value} is not saved`);
      assert.equal(wrapper.find('[role="alert"]').length, 1, value);
    }
  });
});
