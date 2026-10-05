import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';

import UserPreferencedCurrencyDisplay from '../../../../user-preferenced-currency-display';
import CancelTransactionGasFee from '../cancel-transaction-gas-fee.component';

describe('CancelTransactionGasFee Component', function () {
  it('should render', function () {
    const wrapper = shallow(<CancelTransactionGasFee value="0x3b9aca00" />);

    assert.ok(wrapper);
    assert.equal(wrapper.find(UserPreferencedCurrencyDisplay).length, 1);
    const ethDisplay = wrapper.find(UserPreferencedCurrencyDisplay).at(0);

    assert.equal(ethDisplay.props().value, '0x3b9aca00');
    assert.equal(
      ethDisplay.props().className,
      'cancel-transaction-gas-fee__eth',
    );
  });
});
