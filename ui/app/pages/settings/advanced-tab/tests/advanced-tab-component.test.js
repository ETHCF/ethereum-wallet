import assert from 'assert'
import React from 'react'
import sinon from 'sinon'
import { shallow } from 'enzyme'
import AdvancedTab from '../advanced-tab.component'
import TextField from '../../../../components/ui/text-field'

describe('AdvancedTab Component', function () {
  it('should render the auto-lock setting', function () {
    const root = shallow(
      <AdvancedTab setAutoLockTimeLimit={() => undefined} />,
      {
        context: {
          t: (s) => `_${s}`,
        },
      },
    )

    assert.equal(root.find('.settings-page__content-row').length, 1)
  })

  it('should update autoLockTimeLimit', function () {
    const setAutoLockTimeLimitSpy = sinon.spy()
    const root = shallow(
      <AdvancedTab setAutoLockTimeLimit={setAutoLockTimeLimitSpy} />,
      {
        context: {
          t: (s) => `_${s}`,
        },
      },
    )

    const textField = root.find(TextField)
    textField.props().onChange({ target: { value: 1440 } })
    assert.equal(root.state().autoLockTimeLimit, 1440)

    root.find('.settings-tab__rpc-save-button').simulate('click')
    assert.equal(setAutoLockTimeLimitSpy.args[0][0], 1440)
  })
})
