import assert from 'assert'
import React from 'react'
import sinon from 'sinon'
import { mount } from 'enzyme'
import SettingsTab from '..'

describe('Settings Tab', function () {
  const props = {
    displayWarning: sinon.spy(),
    updateCurrentLocale: sinon.spy(),
    warning: '',
    currentLocale: 'en',
  }

  it('selects locale', async function () {
    const wrapper = mount(
      <SettingsTab.WrappedComponent {...props} />, {
        context: {
          t: (str) => str,
        },
      },
    )
    const selectLocale = wrapper.find({ placeholder: 'selectLocale' })

    await selectLocale.props().onSelect('ja')
    assert(props.updateCurrentLocale.calledOnce)
  })
})
