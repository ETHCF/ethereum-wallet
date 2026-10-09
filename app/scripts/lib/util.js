import * as ethUtil from '@ethereumjs/util';
import BN from 'bn.js';
import { memoize } from 'lodash';

import browserGlobal from './browser-global';
import {
  ENVIRONMENT_TYPE_POPUP,
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_BACKGROUND,
} from './enums';

/**
 * @see {@link getEnvironmentType}
 */
const getEnvironmentTypeMemo = memoize((url) => {
  const parsedUrl = new URL(url);
  if (parsedUrl.pathname === '/popup.html') {
    return ENVIRONMENT_TYPE_POPUP;
  } else if (parsedUrl.pathname === '/home.html') {
    return ENVIRONMENT_TYPE_FULLSCREEN;
  } else if (parsedUrl.pathname === '/notification.html') {
    return ENVIRONMENT_TYPE_NOTIFICATION;
  }
  return ENVIRONMENT_TYPE_BACKGROUND;
});

/**
 * Returns the window type for the application
 *
 *  - `popup` refers to the extension opened through the browser app icon (in top right corner in chrome and firefox)
 *  - `fullscreen` refers to the main browser window
 *  - `notification` refers to the popup that appears in its own window when taking action outside of ecf-wallet
 *  - `background` refers to the background page
 *
 * NOTE: This should only be called on internal URLs.
 *
 * @param {string} [url] - the URL of the window
 * @returns {string} the environment ENUM
 */
const getEnvironmentType = (url = browserGlobal.location.href) =>
  getEnvironmentTypeMemo(url);

/**
 * Converts a BN object to a hex string with a '0x' prefix
 *
 * @param {BN} inputBn - The BN to convert to a hex string
 * @returns {string} A '0x' prefixed hex string
 */
function bnToHex(inputBn) {
  return ethUtil.addHexPrefix(inputBn.toString(16));
}

/**
 * Converts a hex string to a BN object
 *
 * @param {string} inputHex - A number represented as a hex string
 * @returns {object} A BN object
 */
function hexToBn(inputHex) {
  return new BN(
    typeof inputHex === 'string' ? ethUtil.stripHexPrefix(inputHex) : inputHex,
    16,
  );
}

/**
 * Used to multiply a BN by a fraction
 *
 * @param {BN} targetBN - The number to multiply by a fraction
 * @param {number|string} numerator - The numerator of the fraction multiplier
 * @param {number|string} denominator - The denominator of the fraction multiplier
 * @returns {BN} The product of the multiplication
 */
function BnMultiplyByFraction(targetBN, numerator, denominator) {
  const numBN = new BN(numerator);
  const denomBN = new BN(denominator);
  return targetBN.mul(numBN).div(denomBN);
}

/**
 * Parses a non-negative integer given as a safe integer, or as a hex
 * (0x-prefixed) or decimal string.
 *
 * @param {number|string} value - The quantity
 * @returns {BN|undefined} The quantity, or undefined if it is malformed
 */
function parseQuantity(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0
      ? new BN(value)
      : undefined;
  }
  if (typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value)) {
    return new BN(value.slice(2), 16);
  }
  if (typeof value === 'string' && /^[0-9]+$/u.test(value)) {
    return new BN(value, 10);
  }
  return undefined;
}

/**
 * Lowercases an address and adds the 0x prefix, as eth-sig-util's normalize did.
 *
 * @param {string|number} input - The address, or an integer
 * @returns {string|undefined} The normalized address, or undefined for empty input
 */
function normalizeAddress(input) {
  if (!input) {
    return undefined;
  }
  const value =
    typeof input === 'number'
      ? ethUtil.bytesToHex(ethUtil.toBytes(input))
      : input;
  if (typeof value !== 'string') {
    throw new Error(
      `normalizeAddress() requires hex string or integer input. received ${typeof value}: ${value}`,
    );
  }
  return ethUtil.addHexPrefix(value.toLowerCase());
}

export {
  getEnvironmentType,
  hexToBn,
  bnToHex,
  BnMultiplyByFraction,
  normalizeAddress,
  parseQuantity,
};
