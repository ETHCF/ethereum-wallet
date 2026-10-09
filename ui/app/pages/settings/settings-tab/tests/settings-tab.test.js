import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import SettingsTab from '..';
import TextField from '../../../../components/ui/text-field';

describe('Settings Tab', function () {
  const props = {
    displayWarning: sinon.spy(),
    updateCurrentLocale: sinon.spy(),
    warning: '',
    currentLocale: 'en',
    setAutoLockTimeLimit: sinon.spy(),
  };

  it('selects locale', async function () {
    const wrapper = mount(<SettingsTab.WrappedComponent {...props} />, {
      context: {
        t: (str) => str,
      },
    });
    const selectLocale = wrapper.find({ placeholder: 'selectLocale' });

    await selectLocale.props().onSelect('ja');
    assert(props.updateCurrentLocale.calledOnce);
  });

  it('updates autoLockTimeLimit', function () {
    const wrapper = mount(<SettingsTab.WrappedComponent {...props} />, {
      context: {
        t: (str) => str,
      },
    });

    wrapper
      .find('input#autoTimeout')
      .simulate('change', { target: { value: '1440' } });
    assert.equal(wrapper.find(TextField).props().value, 1440);

    wrapper.find('button.settings-tab__rpc-save-button').simulate('click');
    assert(props.setAutoLockTimeLimit.calledOnceWithExactly(1440));
  });
});
