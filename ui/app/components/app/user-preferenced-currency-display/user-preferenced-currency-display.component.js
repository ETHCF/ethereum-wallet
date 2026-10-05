import PropTypes from 'prop-types';
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { ETH } from '../../../helpers/constants/common';
import { useUserPreferencedCurrency } from '../../../hooks/useUserPreferencedCurrency';
import { getNativeCurrencyImage } from '../../../selectors';
import CurrencyDisplay from '../../ui/currency-display';

export default function UserPreferencedCurrencyDisplay({
  'data-testid': dataTestId,
  ethLogoHeight = 12,
  ethNumberOfDecimals,
  numberOfDecimals: propsNumberOfDecimals,
  showEthLogo,
  ...restProps
}) {
  const { currency, numberOfDecimals } = useUserPreferencedCurrency({
    ethNumberOfDecimals,
    numberOfDecimals: propsNumberOfDecimals,
  });

  const nativeCurrencyImage = useSelector(getNativeCurrencyImage);

  const prefixComponent = useMemo(() => {
    return (
      currency &&
      (nativeCurrencyImage || currency === ETH) &&
      showEthLogo && (
        <img
          src={nativeCurrencyImage || '/images/eth.svg'}
          height={ethLogoHeight}
        />
      )
    );
  }, [currency, nativeCurrencyImage, showEthLogo, ethLogoHeight]);

  return (
    <CurrencyDisplay
      {...restProps}
      currency={currency}
      data-testid={dataTestId}
      numberOfDecimals={numberOfDecimals}
      prefixComponent={prefixComponent}
    />
  );
}

UserPreferencedCurrencyDisplay.propTypes = {
  className: PropTypes.string,
  'data-testid': PropTypes.string,
  prefix: PropTypes.string,
  value: PropTypes.string,
  numberOfDecimals: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  hideLabel: PropTypes.bool,
  hideTitle: PropTypes.bool,
  style: PropTypes.object,
  showEthLogo: PropTypes.bool,
  ethLogoHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  ethNumberOfDecimals: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
};
