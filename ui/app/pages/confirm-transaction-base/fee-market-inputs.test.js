import { strict as assert } from 'assert'
import React from 'react'
import { shallow } from 'enzyme'
import sinon from 'sinon'
import TextField from '../../components/ui/text-field'
import FeeMarketInputs from './fee-market-inputs'

describe('EIP-1559 fee editing', function () {
  it('converts Gwei exactly and prevents approving a cap below the priority fee', async function () {
    const onChange = sinon.spy()
    const onValidityChange = sinon.spy()
    const wrapper = shallow(
      <FeeMarketInputs
        params={{ maxFeePerGas: '0x77359400', maxPriorityFeePerGas: '0x3b9aca00', gas: '0x5208' }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    )
    wrapper.find(TextField).at(0).prop('onChange')({ target: { value: '0.5' } })
    assert.equal(onChange.callCount, 0)
    assert.equal(onValidityChange.lastCall.args[0], false)
    assert.equal(wrapper.find('[role="alert"]').length, 1)
    wrapper.find(TextField).at(0).prop('onChange')({ target: { value: '1.500000001' } })
    assert.equal(onValidityChange.lastCall.args[0], false, 'approval waits for the fee update')
    await Promise.resolve()
    assert.equal(onValidityChange.lastCall.args[0], true)
    assert.deepEqual(onChange.lastCall.args[0], { maxFeePerGas: '0x59682f01', maxPriorityFeePerGas: '0x3b9aca00', gasLimit: '0x5208' })
    wrapper.find(TextField).at(2).prop('onChange')({ target: { value: '20000' } })
    assert.equal(onValidityChange.lastCall.args[0], false)
  })
})
