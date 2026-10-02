import assert from 'assert'
import React from 'react'
import sinon from 'sinon'
import { mount } from 'enzyme'
import SettingsTab from '..'

describe('Settings Tab', function () {
  let wrapper

  const props = {
    displayWarning: sinon.spy(),
    setUseBlockie: sinon.spy(),
    updateCurrentLocale: sinon.spy(),
    warning: '',
    currentLocale: 'en',
    useBlockie: false,
  }
  beforeEach(function () {
    wrapper = mount(
      <SettingsTab.WrappedComponent {...props} />, {
        context: {
          t: (str) => str,
        },
      },
    )
  })

  it('selects locale', async function () {
    const selectLocale = wrapper.find({ placeholder: 'selectLocale' })

    await selectLocale.props().onSelect('ja')
    assert(props.updateCurrentLocale.calledOnce)
  })

  it('toggles blockies', function () {
    const toggleBlockies = wrapper.find('[role="switch"]')

    toggleBlockies.simulate('click')
    assert(props.setUseBlockie.calledOnce)
  })
})
