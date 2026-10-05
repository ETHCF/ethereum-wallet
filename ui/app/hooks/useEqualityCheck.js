import { isEqual } from 'lodash';
import { useLayoutEffect, useState } from 'react';

/**
 * Returns the previous value while it is equal to the new one, so effects
 * that depend on an object or array rebuilt on every render only run when its
 * contents change.
 *
 * @param {*} value - The value to check
 * @param {Function} [equalityFn] - Determines whether two values are equal
 * @returns {*} The value, or an equal value from an earlier render
 */
export function useEqualityCheck(value, equalityFn = isEqual) {
  const [computedValue, setComputedValue] = useState(value);

  useLayoutEffect(() => {
    if (!equalityFn(value, computedValue)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keeps the previous reference until the value changes, which is this hook's purpose
      setComputedValue(value);
    }
  }, [value, equalityFn, computedValue]);

  return computedValue;
}
