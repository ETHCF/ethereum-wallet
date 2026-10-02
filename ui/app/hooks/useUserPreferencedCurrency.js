import { useSelector } from 'react-redux'
import { getNativeCurrency } from '../selectors'

/**
 * Returns the currency to display values in, which is always the current
 * network's native currency, and the number of decimals to show.
 *
 * @param {Object} [opts]
 * @param {number} [opts.numberOfDecimals] - Number of significant decimals to display
 * @param {number} [opts.ethNumberOfDecimals] - Used when numberOfDecimals is not given
 * @returns {{ currency: string, numberOfDecimals: number }}
 */
export function useUserPreferencedCurrency (opts = {}) {
  const nativeCurrency = useSelector(getNativeCurrency)
  return {
    currency: nativeCurrency,
    numberOfDecimals: opts.numberOfDecimals || opts.ethNumberOfDecimals || 6,
  }
}
