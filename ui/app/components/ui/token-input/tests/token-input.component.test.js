import assert from 'assert';
import { shallow, mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import UnitInput from '../../unit-input';
import TokenInput from '../token-input.component';

describe('TokenInput Component', function () {
  const token = {
    address: '0x1',
    decimals: 4,
    symbol: 'ABC',
  };

  describe('rendering', function () {
    it('should render the token symbol and no conversion', function () {
      const wrapper = mount(<TokenInput token={token} />);

      assert.equal(wrapper.find('.unit-input__suffix').text(), 'ABC');
      assert.equal(
        wrapper.find('.currency-input__conversion-component').length,
        0,
      );
    });

    it('should render a hex token value as a decimal amount', function () {
      const wrapper = mount(<TokenInput value="2710" token={token} />);

      const tokenInputInstance = wrapper.find(TokenInput).at(0).instance();
      assert.equal(tokenInputInstance.state.decimalValue, 1);
      assert.equal(tokenInputInstance.state.hexValue, '2710');
      assert.equal(wrapper.find('.unit-input__input').props().value, '1');
    });
  });

  describe('handling actions', function () {
    const handleChangeSpy = sinon.spy();

    afterEach(function () {
      handleChangeSpy.resetHistory();
    });

    it('should call onChange on input changes with the hex value', function () {
      const wrapper = mount(
        <TokenInput onChange={handleChangeSpy} token={token} />,
      );

      const tokenInputInstance = wrapper.find(TokenInput).at(0).instance();
      assert.equal(tokenInputInstance.state.decimalValue, 0);
      assert.equal(tokenInputInstance.state.hexValue, undefined);
      const input = wrapper.find('input');
      assert.equal(input.props().value, 0);

      input.simulate('change', { target: { value: 1 } });
      assert.ok(handleChangeSpy.calledOnceWith('2710'));
      assert.equal(tokenInputInstance.state.decimalValue, 1);
      assert.equal(tokenInputInstance.state.hexValue, '2710');
    });

    it('should change the state and pass in a new decimalValue when props.value changes', function () {
      const wrapper = shallow(
        <TokenInput onChange={handleChangeSpy} token={token} />,
      );

      assert.equal(wrapper.state('decimalValue'), 0);
      assert.equal(wrapper.state('hexValue'), undefined);
      assert.equal(wrapper.find(UnitInput).props().value, 0);

      wrapper.setProps({ value: '2710' });
      wrapper.update();
      assert.equal(wrapper.state('decimalValue'), 1);
      assert.equal(wrapper.state('hexValue'), '2710');
      assert.equal(wrapper.find(UnitInput).props().value, 1);
    });
  });
});
