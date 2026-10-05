import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { GAS_ESTIMATE_TYPES } from '../../../../helpers/constants/common';
import Button from '../../../ui/button';
import ButtonGroup from '../../../ui/button-group';

const GAS_OBJECT_PROPTYPES_SHAPE = {
  gasEstimateType: PropTypes.oneOf(Object.values(GAS_ESTIMATE_TYPES))
    .isRequired,
  feeInPrimaryCurrency: PropTypes.string,
  priceInHexWei: PropTypes.string,
};

export default class GasPriceButtonGroup extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    buttonDataLoading: PropTypes.bool,
    className: PropTypes.string,
    defaultActiveButtonIndex: PropTypes.number,
    gasButtonInfo: PropTypes.arrayOf(
      PropTypes.shape(GAS_OBJECT_PROPTYPES_SHAPE),
    ),
    handleGasPriceSelection: PropTypes.func,
    newActiveButtonIndex: PropTypes.number,
    noButtonActiveByDefault: PropTypes.bool,
    showCheck: PropTypes.bool,
  };

  gasEstimateTypeLabel(gasEstimateType) {
    if (gasEstimateType === GAS_ESTIMATE_TYPES.SLOW) {
      return this.context.t('slow');
    } else if (gasEstimateType === GAS_ESTIMATE_TYPES.AVERAGE) {
      return this.context.t('average');
    } else if (gasEstimateType === GAS_ESTIMATE_TYPES.FAST) {
      return this.context.t('fast');
    }
    throw new Error(`Unrecognized gas estimate type: ${gasEstimateType}`);
  }

  renderButtonContent(
    { gasEstimateType, feeInPrimaryCurrency },
    { className, showCheck },
  ) {
    return (
      <div>
        {gasEstimateType && (
          <div className={`${className}__label`}>
            {this.gasEstimateTypeLabel(gasEstimateType)}
          </div>
        )}
        {feeInPrimaryCurrency && (
          <div className={`${className}__primary-currency`}>
            {feeInPrimaryCurrency}
          </div>
        )}
        {showCheck && (
          <div className="button-check-wrapper">
            <i className="fa fa-check fa-sm" />
          </div>
        )}
      </div>
    );
  }

  renderButton(
    { priceInHexWei, ...renderableGasInfo },
    {
      buttonDataLoading: _,
      handleGasPriceSelection,
      ...buttonContentPropsAndFlags
    },
    index,
  ) {
    return (
      <Button
        onClick={() => handleGasPriceSelection(priceInHexWei)}
        key={`gas-price-button-${index}`}
      >
        {this.renderButtonContent(
          renderableGasInfo,
          buttonContentPropsAndFlags,
        )}
      </Button>
    );
  }

  render() {
    const {
      gasButtonInfo,
      defaultActiveButtonIndex = 1,
      newActiveButtonIndex,
      noButtonActiveByDefault = false,
      buttonDataLoading,
      ...buttonPropsAndFlags
    } = this.props;

    return buttonDataLoading ? (
      <div className={`${buttonPropsAndFlags.className}__loading-container`}>
        {this.context.t('loading')}
      </div>
    ) : (
      <ButtonGroup
        className={buttonPropsAndFlags.className}
        defaultActiveButtonIndex={defaultActiveButtonIndex}
        newActiveButtonIndex={newActiveButtonIndex}
        noButtonActiveByDefault={noButtonActiveByDefault}
      >
        {gasButtonInfo.map((obj, index) =>
          this.renderButton(obj, buttonPropsAndFlags, index),
        )}
      </ButtonGroup>
    );
  }
}
