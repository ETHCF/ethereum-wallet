import assert from 'assert';
import React from 'react';
import sinon from 'sinon';

import shallow from '../../../../../../lib/shallow-with-context';
import ButtonGroup from '../../../../ui/button-group';
import GasPriceButtonGroup from '../gas-price-button-group.component';

describe('GasPriceButtonGroup Component', function () {
  let mockButtonPropsAndFlags;
  let mockGasPriceButtonGroupProps;
  let wrapper;

  beforeEach(function () {
    mockGasPriceButtonGroupProps = {
      buttonDataLoading: false,
      className: 'gas-price-button-group',
      gasButtonInfo: [
        {
          feeInPrimaryCurrency: '0.0048 ETH',
          priceInHexWei: '0xa1b2c3f',
        },
        {
          feeInPrimaryCurrency: '0.004 ETH',
          priceInHexWei: '0xa1b2c39',
        },
        {
          feeInPrimaryCurrency: '0.00354 ETH',
          priceInHexWei: '0xa1b2c30',
        },
      ],
      handleGasPriceSelection: sinon.spy(),
      noButtonActiveByDefault: true,
      defaultActiveButtonIndex: 2,
      showCheck: true,
    };

    mockButtonPropsAndFlags = {
      className: mockGasPriceButtonGroupProps.className,
      handleGasPriceSelection:
        mockGasPriceButtonGroupProps.handleGasPriceSelection,
      showCheck: mockGasPriceButtonGroupProps.showCheck,
    };

    sinon.spy(GasPriceButtonGroup.prototype, 'renderButton');
    sinon.spy(GasPriceButtonGroup.prototype, 'renderButtonContent');

    wrapper = shallow(
      <GasPriceButtonGroup {...mockGasPriceButtonGroupProps} />,
    );
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('render', function () {
    it('should render a ButtonGroup', function () {
      assert(wrapper.is(ButtonGroup));
    });

    it('should render the correct props on the ButtonGroup', function () {
      const { className, defaultActiveButtonIndex, noButtonActiveByDefault } =
        wrapper.props();
      assert.equal(className, 'gas-price-button-group');
      assert.equal(defaultActiveButtonIndex, 2);
      assert.equal(noButtonActiveByDefault, true);
    });

    function renderButtonArgsTest(i, mockPropsAndFlags) {
      assert.deepEqual(
        GasPriceButtonGroup.prototype.renderButton.getCall(i).args,
        [
          { ...mockGasPriceButtonGroupProps.gasButtonInfo[i] },
          mockPropsAndFlags,
          i,
        ],
      );
    }

    it('should call this.renderButton 3 times, with the correct args', function () {
      assert.equal(GasPriceButtonGroup.prototype.renderButton.callCount, 3);
      renderButtonArgsTest(0, mockButtonPropsAndFlags);
      renderButtonArgsTest(1, mockButtonPropsAndFlags);
      renderButtonArgsTest(2, mockButtonPropsAndFlags);
    });

    it('should show loading if buttonDataLoading', function () {
      wrapper.setProps({ buttonDataLoading: true });
      assert(wrapper.is('div'));
      assert(wrapper.hasClass('gas-price-button-group__loading-container'));
      assert.equal(wrapper.text(), 'loading');
    });
  });

  describe('renderButton', function () {
    let wrappedRenderButtonResult;

    beforeEach(function () {
      GasPriceButtonGroup.prototype.renderButtonContent.resetHistory();
      const renderButtonResult = GasPriceButtonGroup.prototype.renderButton(
        { ...mockGasPriceButtonGroupProps.gasButtonInfo[0] },
        mockButtonPropsAndFlags,
      );
      wrappedRenderButtonResult = shallow(renderButtonResult);
    });

    it('should render a button', function () {
      assert.equal(wrappedRenderButtonResult.type(), 'button');
    });

    it('should call the correct method when clicked', function () {
      assert.equal(
        mockGasPriceButtonGroupProps.handleGasPriceSelection.callCount,
        0,
      );
      wrappedRenderButtonResult.props().onClick();
      assert.equal(
        mockGasPriceButtonGroupProps.handleGasPriceSelection.callCount,
        1,
      );
      assert.deepEqual(
        mockGasPriceButtonGroupProps.handleGasPriceSelection.getCall(0).args,
        [mockGasPriceButtonGroupProps.gasButtonInfo[0].priceInHexWei],
      );
    });

    it('should call this.renderButtonContent with the correct args', function () {
      assert.equal(
        GasPriceButtonGroup.prototype.renderButtonContent.callCount,
        1,
      );
      const { feeInPrimaryCurrency } =
        mockGasPriceButtonGroupProps.gasButtonInfo[0];
      const { showCheck, className } = mockGasPriceButtonGroupProps;
      assert.deepEqual(
        GasPriceButtonGroup.prototype.renderButtonContent.getCall(0).args,
        [
          {
            feeInPrimaryCurrency,
          },
          {
            showCheck,
            className,
          },
        ],
      );
    });
  });

  describe('renderButtonContent', function () {
    it('should render a label if passed a gasEstimateType', function () {
      const renderButtonContentResult = wrapper.instance().renderButtonContent(
        {
          gasEstimateType: 'SLOW',
        },
        {
          className: 'someClass',
        },
      );
      const wrappedRenderButtonContentResult = shallow(
        renderButtonContentResult,
      );
      assert.equal(
        wrappedRenderButtonContentResult.childAt(0).children().length,
        1,
      );
      assert.equal(
        wrappedRenderButtonContentResult.find('.someClass__label').text(),
        'slow',
      );
    });

    it('should render a feeInPrimaryCurrency if passed a feeInPrimaryCurrency', function () {
      const renderButtonContentResult =
        GasPriceButtonGroup.prototype.renderButtonContent(
          {
            feeInPrimaryCurrency: 'mockFeeInPrimaryCurrency',
          },
          {
            className: 'someClass',
          },
        );
      const wrappedRenderButtonContentResult = shallow(
        renderButtonContentResult,
      );
      assert.equal(
        wrappedRenderButtonContentResult.childAt(0).children().length,
        1,
      );
      assert.equal(
        wrappedRenderButtonContentResult
          .find('.someClass__primary-currency')
          .text(),
        'mockFeeInPrimaryCurrency',
      );
    });

    it('should render a check if showCheck is true', function () {
      const renderButtonContentResult =
        GasPriceButtonGroup.prototype.renderButtonContent(
          {},
          {
            className: 'someClass',
            showCheck: true,
          },
        );
      const wrappedRenderButtonContentResult = shallow(
        renderButtonContentResult,
      );
      assert.equal(
        wrappedRenderButtonContentResult.find('.fa-check').length,
        1,
      );
    });

    it('should render all elements if all args passed', function () {
      const renderButtonContentResult = wrapper.instance().renderButtonContent(
        {
          gasEstimateType: 'SLOW',
          feeInPrimaryCurrency: 'mockFeeInPrimaryCurrency',
        },
        {
          className: 'someClass',
          showCheck: true,
        },
      );
      const wrappedRenderButtonContentResult = shallow(
        renderButtonContentResult,
      );
      assert.equal(wrappedRenderButtonContentResult.children().length, 3);
    });

    it('should render no elements if all args passed', function () {
      const renderButtonContentResult =
        GasPriceButtonGroup.prototype.renderButtonContent({}, {});
      const wrappedRenderButtonContentResult = shallow(
        renderButtonContentResult,
      );
      assert.equal(wrappedRenderButtonContentResult.children().length, 0);
    });
  });
});
