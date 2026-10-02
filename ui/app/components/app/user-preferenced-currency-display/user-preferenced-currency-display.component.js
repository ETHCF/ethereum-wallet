import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import { PRIMARY, SECONDARY, ETH } from '../../../helpers/constants/common'
import CurrencyDisplay from '../../ui/currency-display'
import { useUserPreferencedCurrency } from '../../../hooks/useUserPreferencedCurrency'
import { getNativeCurrencyImage } from '../../../selectors'

export default function UserPreferencedCurrencyDisplay ({
  'data-testid': dataTestId,
  ethLogoHeight = 12,
  ethNumberOfDecimals,
  fiatNumberOfDecimals,
  numberOfDecimals: propsNumberOfDecimals,
  showEthLogo,
  type,
  ...restProps
}) {
  const { currency, numberOfDecimals } = useUserPreferencedCurrency(type, { ethNumberOfDecimals, fiatNumberOfDecimals, numberOfDecimals: propsNumberOfDecimals })

  const nativeCurrencyImage = useSelector(getNativeCurrencyImage)

  const prefixComponent = useMemo(() => {
    // currency is only set when displaying the native currency
    return currency && (nativeCurrencyImage || currency === ETH) && showEthLogo && (
      <img
        src={nativeCurrencyImage || '/images/eth.svg'}
        height={ethLogoHeight}
      />
    )
  }, [currency, nativeCurrencyImage, showEthLogo, ethLogoHeight])

  return (
    <CurrencyDisplay
      {...restProps}
      currency={currency}
      data-testid={dataTestId}
      numberOfDecimals={numberOfDecimals}
      prefixComponent={prefixComponent}
    />
  )
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
  type: PropTypes.oneOf([PRIMARY, SECONDARY]),
  ethNumberOfDecimals: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  fiatNumberOfDecimals: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}
