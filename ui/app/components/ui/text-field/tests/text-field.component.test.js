import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import TextField from '../text-field.component';

describe('TextField', function () {
  it('labels the input and passes input props through', function () {
    const onChange = sinon.spy();
    const wrapper = mount(
      <TextField
        id="password"
        label="Password"
        type="password"
        value=""
        onChange={onChange}
        autoComplete="current-password"
      />,
    );
    const input = wrapper.find('input');
    assert.equal(wrapper.find('label').prop('htmlFor'), 'password');
    assert.equal(input.prop('id'), 'password');
    assert.equal(input.prop('type'), 'password');
    assert.equal(input.prop('autoComplete'), 'current-password');
    input.simulate('change', { target: { value: 'secret' } });
    assert.ok(onChange.calledOnce);
  });

  it('shows the error under the input and links it for screen readers', function () {
    const wrapper = mount(<TextField id="amount" error="Too low" />);
    const input = wrapper.find('input');
    assert.equal(wrapper.find('.text-field__helper-text').text(), 'Too low');
    assert.equal(input.prop('aria-invalid'), true);
    assert.equal(input.prop('aria-describedby'), 'amount-helper-text');
    assert.ok(wrapper.find('.text-field').hasClass('text-field--error'));
  });

  it('raises the material label when the field is focused or filled', function () {
    const wrapper = mount(
      <TextField
        id="password"
        label="Password"
        theme="material"
        value=""
        onChange={() => undefined}
      />,
    );
    const raised = () =>
      wrapper.find('label').hasClass('text-field__label--raised');
    assert.equal(raised(), false);
    wrapper.find('input').simulate('focus');
    assert.equal(raised(), true);
    wrapper.find('input').simulate('blur');
    assert.equal(raised(), false);
    wrapper.setProps({ value: 'secret' });
    assert.equal(raised(), true);
  });

  it('renders the start adornment before the input', function () {
    const wrapper = mount(<TextField startAdornment={<img alt="search" />} />);
    const root = wrapper.find('.text-field__input-root');
    assert.equal(root.childAt(0).find('img').length, 1);
    assert.equal(root.childAt(1).type(), 'input');
  });
});
