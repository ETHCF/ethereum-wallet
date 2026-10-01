
/**
 * Freezes the Promise global and prevents its reassignment.
 */
import deepFreeze from 'deep-freeze-strict'

if (
  process.env.IN_TEST !== 'true' &&
  process.env.ECF_WALLET_ENV !== 'test'
) {
  freeze(global, 'Promise')
}

/**
 * Makes a key:value pair on a target object immutable, with limitations.
 * The key cannot be reassigned or deleted, and the value is recursively frozen
 * using Object.freeze.
 *
 * Because of JavaScript language limitations, this is does not mean that the
 * value is completely immutable. It is, however, better than nothing.
 *
 * @param {Object} target - The target object to freeze a property on.
 * @param {string} key - The key to freeze.
 * @param {any} [value] - The value to freeze, if different from the existing value on the target.
 * @param {boolean} [enumerable=true] - If given a value, whether the property is enumerable.
 */
export function freeze (target, key, value, enumerable = true) {

  // SES lockdown (lockdown-run.js, lockdown-more.js) already hardens the
  // intrinsics and makes their globals read-only; reassigning one would throw.
  const descriptor = Object.getOwnPropertyDescriptor(target, key)
  if (descriptor && !descriptor.configurable && descriptor.writable === false) {
    return
  }

  const opts = {
    configurable: false, writable: false,
  }

  if (value === undefined) {
    target[key] = deepFreeze(target[key])
  } else {
    opts.value = deepFreeze(value)
    opts.enumerable = enumerable
  }

  Object.defineProperty(target, key, opts)
}
