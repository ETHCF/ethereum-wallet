import assert from 'assert';
import React from 'react';
import sinon from 'sinon';

import shallow from '../../../../../../../lib/shallow-with-context';
import AdvancedGasInputs from '../../../advanced-gas-inputs';
import AdvancedTabContent from '../advanced-tab-content.component';

describe('AdvancedTabContent Component', function () {
  let wrapper;

  beforeEach(function () {
    const propsMethodSpies = {
      updateCustomGasPrice: sinon.spy(),
      updateCustomGasLimit: sinon.spy(),
    };

    wrapper = shallow(
      <AdvancedTabContent
        updateCustomGasPrice={propsMethodSpies.updateCustomGasPrice}
        updateCustomGasLimit={propsMethodSpies.updateCustomGasLimit}
        customModalGasPriceInHex="11"
        customModalGasLimitInHex="23456"
        transactionFee="$0.25"
        insufficientBalance={false}
        customPriceIsSafe
        isSpeedUp={false}
      />,
    );
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('render()', function () {
    it('should render the fee summary and the gas inputs', function () {
      const advancedTabChildren = wrapper.children();
      assert.equal(advancedTabChildren.length, 2);

      assert(
        advancedTabChildren
          .at(0)
          .hasClass('advanced-tab__transaction-data-summary'),
      );
      assert(advancedTabChildren.at(1).hasClass('advanced-tab__gas-section'));
      assert(advancedTabChildren.at(1).find(AdvancedGasInputs).exists());
    });
  });

  describe('renderDataSummary()', function () {
    it('should render the fee', function () {
      const dataSummary = shallow(
        wrapper.instance().renderDataSummary('mockTotalFee'),
      );
      const dataNode = dataSummary.children().at(1);
      assert(
        dataNode.hasClass('advanced-tab__transaction-data-summary__container'),
      );
      assert.equal(dataNode.children().at(0).text(), 'mockTotalFee');
    });
  });
});
