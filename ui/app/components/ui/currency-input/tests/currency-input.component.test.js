import assert from 'assert';
import { shallow, mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import UnitInput from '../../unit-input';
import CurrencyInput from '../currency-input.component';

describe('CurrencyInput Component', function () {
  describe('rendering', function () {
    it('should render properly without a nativeCurrency', function () {
      const wrapper = shallow(<CurrencyInput />);

      assert.ok(wrapper);
      assert.equal(wrapper.find(UnitInput).length, 1);
      assert.equal(wrapper.find(UnitInput).props().suffix, 'ETH');
    });

    it('should render properly with a nativeCurrency suffix', function () {
      const wrapper = mount(<CurrencyInput nativeCurrency="TESTETH" />);

      assert.ok(wrapper);
      assert.equal(wrapper.find('.unit-input__suffix').length, 1);
      assert.equal(wrapper.find('.unit-input__suffix').text(), 'TESTETH');
    });

    it('should render properly with an ETH value', function () {
      const wrapper = mount(
        <CurrencyInput value="de0b6b3a7640000" nativeCurrency="ETH" />,
      );

      assert.ok(wrapper);
      const currencyInputInstance = wrapper
        .find(CurrencyInput)
        .at(0)
        .instance();
      assert.equal(currencyInputInstance.state.decimalValue, 1);
      assert.equal(currencyInputInstance.state.hexValue, 'de0b6b3a7640000');
      assert.equal(wrapper.find('.unit-input__suffix').length, 1);
      assert.equal(wrapper.find('.unit-input__suffix').text(), 'ETH');
      assert.equal(wrapper.find('.unit-input__input').props().value, '1');
    });

    it('should round the displayed value to 6 decimals', function () {
      const wrapper = mount(
        <CurrencyInput value="f602f2234d0ea" nativeCurrency="ETH" />,
      );

      assert.ok(wrapper);
      const currencyInputInstance = wrapper
        .find(CurrencyInput)
        .at(0)
        .instance();
      assert.equal(currencyInputInstance.state.decimalValue, 0.004328);
      assert.equal(currencyInputInstance.state.hexValue, 'f602f2234d0ea');
      assert.equal(
        wrapper.find('.unit-input__input').props().value,
        '0.004328',
      );
    });
  });

  describe('handling actions', function () {
    const handleChangeSpy = sinon.spy();

    afterEach(function () {
      handleChangeSpy.resetHistory();
    });

    it('should call onChange on input changes with the hex value for ETH', function () {
      const wrapper = mount(
        <CurrencyInput onChange={handleChangeSpy} nativeCurrency="ETH" />,
      );

      assert.ok(wrapper);
      assert.equal(handleChangeSpy.callCount, 0);

      const currencyInputInstance = wrapper
        .find(CurrencyInput)
        .at(0)
        .instance();
      assert.equal(currencyInputInstance.state.decimalValue, 0);
      assert.equal(currencyInputInstance.state.hexValue, undefined);
      const input = wrapper.find('input');
      assert.equal(input.props().value, 0);

      input.simulate('change', { target: { value: 1 } });
      assert.equal(handleChangeSpy.callCount, 1);
      assert.ok(handleChangeSpy.calledWith('de0b6b3a7640000'));
      assert.equal(currencyInputInstance.state.decimalValue, 1);
      assert.equal(currencyInputInstance.state.hexValue, 'de0b6b3a7640000');
    });

    it('should change the state and pass in a new decimalValue when props.value changes', function () {
      const wrapper = shallow(
        <CurrencyInput onChange={handleChangeSpy} nativeCurrency="ETH" />,
      );

      assert.ok(wrapper);
      assert.equal(wrapper.state('decimalValue'), 0);
      assert.equal(wrapper.state('hexValue'), undefined);
      assert.equal(wrapper.find(UnitInput).props().value, 0);

      wrapper.setProps({ value: '1bc16d674ec80000' });
      wrapper.update();
      assert.equal(wrapper.state('decimalValue'), 2);
      assert.equal(wrapper.state('hexValue'), '1bc16d674ec80000');
      assert.equal(wrapper.find(UnitInput).props().value, 2);
    });
  });
});
