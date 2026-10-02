import { useLayoutEffect, useState } from 'react'
import { isEqual } from 'lodash'

/**
 * Returns the previous value while it is equal to the new one, so effects
 * that depend on an object or array rebuilt on every render only run when its
 * contents change.
 *
 * @param {*} value - The value to check
 * @param {Function} [equalityFn] - Determines whether two values are equal
 * @returns {*} The value, or an equal value from an earlier render
 */
export function useEqualityCheck (value, equalityFn = isEqual) {
  const [computedValue, setComputedValue] = useState(value)

  useLayoutEffect(() => {
    if (!equalityFn(value, computedValue)) {
      setComputedValue(value)
    }
  }, [value, equalityFn, computedValue])

  return computedValue
}
