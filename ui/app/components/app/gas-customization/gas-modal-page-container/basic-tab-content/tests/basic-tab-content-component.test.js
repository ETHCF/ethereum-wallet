import assert from 'assert';
import React from 'react';

import shallow from '../../../../../../../lib/shallow-with-context';
import { GAS_ESTIMATE_TYPES } from '../../../../../../helpers/constants/common';
import Loading from '../../../../../ui/loading-screen';
import GasPriceButtonGroup from '../../../gas-price-button-group';
import BasicTabContent from '../basic-tab-content.component';

const mockGasPriceButtonGroupProps = {
  buttonDataLoading: false,
  className: 'gas-price-button-group',
  gasButtonInfo: [
    {
      feeInPrimaryCurrency: '$0.52',
      feeInSecondaryCurrency: '0.0048 ETH',
      timeEstimate: '~ 1 min 0 sec',
      priceInHexWei: '0xa1b2c3f',
      gasEstimateType: GAS_ESTIMATE_TYPES.AVERAGE,
    },
    {
      feeInPrimaryCurrency: '$0.39',
      feeInSecondaryCurrency: '0.004 ETH',
      timeEstimate: '~ 1 min 30 sec',
      priceInHexWei: '0xa1b2c39',
      gasEstimateType: GAS_ESTIMATE_TYPES.AVERAGE,
    },
    {
      feeInPrimaryCurrency: '$0.30',
      feeInSecondaryCurrency: '0.00354 ETH',
      timeEstimate: '~ 2 min 1 sec',
      priceInHexWei: '0xa1b2c30',
      gasEstimateType: GAS_ESTIMATE_TYPES.AVERAGE,
    },
  ],
  handleGasPriceSelection: (newPrice) => console.log('NewPrice: ', newPrice),
  noButtonActiveByDefault: true,
  showCheck: true,
};

describe('BasicTabContent Component', function () {
  describe('render', function () {
    it('should render a loading component instead of the GasPriceButtonGroup if gasPriceButtonGroupProps.loading is true', function () {
      const wrapper = shallow(
        <BasicTabContent
          gasPriceButtonGroupProps={mockGasPriceButtonGroupProps}
        />,
      );
      wrapper.setProps({
        gasPriceButtonGroupProps: {
          ...mockGasPriceButtonGroupProps,
          loading: true,
        },
      });

      assert.equal(wrapper.find(GasPriceButtonGroup).length, 0);
      assert.equal(wrapper.find(Loading).length, 1);
    });
  });
});
