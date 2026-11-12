import * as ethUtil from '@ethereumjs/util';
import { BigNumber } from 'bignumber.js';
import BN from 'bn.js';
import { DateTime } from 'luxon';
import punycode from 'punycode';

import { toChecksumHexAddress } from '../../../../app/scripts/lib/checksum-address';

// formatDate :: ( date: <Unix Timestamp> ) -> String
export function formatDate(date, format = "M/d/y 'at' T") {
  return DateTime.fromMillis(date).toFormat(format);
}

export function formatDateWithYearContext(
  date,
  formatThisYear = 'MMM d',
  fallback = 'MMM d, y',
) {
  const dateTime = DateTime.fromMillis(date);
  const now = DateTime.local();
  return dateTime.toFormat(
    now.year === dateTime.year ? formatThisYear : fallback,
  );
}

export function isEthNetwork(netId) {
  if (
    !netId ||
    netId === '1' ||
    netId === '3' ||
    netId === '4' ||
    netId === '42' ||
    netId === '1337' ||
    netId === '5777'
  ) {
    return true;
  }

  return false;
}

export function valuesFor(obj) {
  if (!obj) {
    return [];
  }
  return Object.keys(obj).map(function (key) {
    return obj[key];
  });
}

export function isValidAddress(address) {
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return false;
  }
  // @ethereumjs/util only accepts a lower case 0x prefix.
  const prefixed = ethUtil.addHexPrefix(
    address.startsWith('0X') ? address.slice(2) : address,
  );
  return (
    (isAllOneCase(prefixed.slice(2)) && ethUtil.isValidAddress(prefixed)) ||
    ethUtil.isValidChecksumAddress(prefixed)
  );
}

export function isValidDomainName(address) {
  const match = punycode
    .toASCII(address)
    .toLowerCase()
    // Checks that the domain consists of at least one valid domain pieces separated by periods, followed by a tld
    // Each piece of domain name has only the characters a-z, 0-9, and a hyphen (but not at the start or end of chunk)
    // A chunk has minimum length of 1, but minimum tld is set to 2 for now (no 1-character tlds exist yet)
    .match(
      /^(?:[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.)+[a-z0-9][-a-z0-9]*[a-z0-9]$/u,
    );
  return match !== null;
}

export function isAllOneCase(address) {
  if (!address) {
    return true;
  }
  const lower = address.toLowerCase();
  const upper = address.toUpperCase();
  return address === lower || address === upper;
}

// Takes wei Hex, returns wei BN, even if input is null
export function numericBalance(balance) {
  if (!balance) {
    return new BN(0, 16);
  }
  const stripped = ethUtil.stripHexPrefix(balance);
  return new BN(stripped, 16);
}

// Takes  hex, returns [beforeDecimal, afterDecimal]
export function parseBalance(balance) {
  let afterDecimal;
  const wei = numericBalance(balance);
  const weiString = wei.toString();
  const trailingZeros = /0+$/u;

  const beforeDecimal =
    weiString.length > 18 ? weiString.slice(0, weiString.length - 18) : '0';
  afterDecimal = `000000000000000000${wei}`
    .slice(-18)
    .replace(trailingZeros, '');
  if (afterDecimal === '') {
    afterDecimal = '0';
  }
  return [beforeDecimal, afterDecimal];
}

// Takes wei hex, returns an object with three properties.
// Its "formatted" property is what we generally use to render values.
export function formatBalance(
  balance,
  decimalsToKeep,
  needsParse = true,
  ticker = 'ETH',
) {
  const parsed = needsParse ? parseBalance(balance) : balance.split('.');
  const beforeDecimal = parsed[0];
  let afterDecimal = parsed[1];
  let formatted = 'None';
  if (decimalsToKeep === undefined) {
    if (beforeDecimal === '0') {
      if (afterDecimal !== '0') {
        const sigFigs = afterDecimal.match(/^0*(.{2})/u); // default: grabs 2 most significant digits
        if (sigFigs) {
          afterDecimal = sigFigs[0];
        }
        formatted = `0.${afterDecimal} ${ticker}`;
      }
    } else {
      formatted = `${beforeDecimal}.${afterDecimal.slice(0, 3)} ${ticker}`;
    }
  } else {
    afterDecimal += Array(decimalsToKeep).join('0');
    formatted = `${beforeDecimal}.${afterDecimal.slice(0, decimalsToKeep)} ${ticker}`;
  }
  return formatted;
}

const DISPLAY_SIGNIFICANT_DIGITS = 6;
const DISPLAY_MIN_DECIMALS = 2;

/**
 * Formats an amount for display: up to 6 significant figures, but never cut
 * to fewer than 2 decimals, rounded down so a balance is never overstated,
 * trailing zeros dropped.
 * 123456.789 -> '123456.78', 12.3456789 -> '12.3456', 1 -> '1',
 * 0.00123456789 -> '0.00123456'.
 *
 * @param {string|number|BigNumber} value - The amount, in whole units
 * (ETH, not wei).
 * @returns {string} The formatted amount.
 */
export function formatDisplayAmount(value) {
  const amount = new BigNumber(String(value));
  if (!amount.isFinite()) {
    return String(value);
  }
  if (amount.isZero()) {
    return '0';
  }
  // `e` is the exponent of the leading digit: floor(log10(|amount|)).
  const decimals = Math.max(
    DISPLAY_MIN_DECIMALS,
    DISPLAY_SIGNIFICANT_DIGITS - 1 - amount.e,
  );
  // Trailing zeros are dropped: 1.50 -> '1.5', 1.00 -> '1'.
  return amount.decimalPlaces(decimals, BigNumber.ROUND_DOWN).toFixed();
}

/**
 * Formats a token tracker entry's balance with formatDisplayAmount.
 *
 * @param {object} [tokenData] - An entry from useTokenTracker.
 * @returns {string|undefined} The formatted balance, or undefined while it
 * is not known.
 */
export function formatTokenBalance(tokenData) {
  if (!tokenData || tokenData.balance === undefined) {
    return undefined;
  }
  return formatDisplayAmount(
    new BigNumber(String(tokenData.balance)).shiftedBy(
      -Number(tokenData.decimals || 0),
    ),
  );
}

// Takes a BN and an ethereum currency name,
// returns a BN in wei
export function isHex(str) {
  return Boolean(str.match(/^(0x)?[0-9a-fA-F]+$/u));
}

export function getRandomFileName() {
  let fileName = '';
  const charBank = [
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ];
  const fileNameLength = Math.floor(Math.random() * 7 + 6);

  for (let i = 0; i < fileNameLength; i++) {
    fileName += charBank[Math.floor(Math.random() * charBank.length)];
  }

  return fileName;
}

export function exportAsFile(filename, data, type = 'text/csv') {
  // eslint-disable-next-line no-param-reassign
  filename = filename || getRandomFileName();
  // source: https://stackoverflow.com/a/33542499 by Ludovic Feltz
  const blob = new window.Blob([data], { type });
  if (window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveBlob(blob, filename);
  } else {
    const elem = window.document.createElement('a');
    elem.target = '_blank';
    elem.href = window.URL.createObjectURL(blob);
    elem.download = filename;
    document.body.appendChild(elem);
    elem.click();
    document.body.removeChild(elem);
  }
}

/**
 * Safely checksumms a potentially-null address
 *
 * @param {string} [address] - address to checksum
 * @returns {string} checksummed address
 */
export function checksumAddress(address) {
  const checksummed = address ? toChecksumHexAddress(address) : '';
  return checksummed;
}

export function isValidAddressHead(address) {
  const addressLengthIsLessThanFull = address.length < 42;
  const addressIsHex = isHex(address);

  return addressLengthIsLessThanFull && addressIsHex;
}

export function getAccountByAddress(accounts = [], targetAddress) {
  return accounts.find(({ address }) => address === targetAddress);
}

/**
 * Strips the following schemes from URL strings:
 * - http
 * - https
 *
 * @param {string} urlString - The URL string to strip the scheme from.
 * @returns {string} The URL string, without the scheme, if it was stripped.
 */
export function stripHttpSchemes(urlString) {
  return urlString.replace(/^https?:\/\//u, '');
}

/**
 * Checks whether a URL-like value (object or string) is an extension URL.
 *
 * @param {string | URL | object} urlLike - The URL-like value to test.
 * @returns {boolean} Whether the URL-like value is an extension URL.
 */
export function isExtensionUrl(urlLike) {
  const EXT_PROTOCOLS = ['chrome-extension:', 'moz-extension:'];

  if (typeof urlLike === 'string') {
    for (const protocol of EXT_PROTOCOLS) {
      if (urlLike.startsWith(protocol)) {
        return true;
      }
    }
  }

  if (urlLike?.protocol) {
    return EXT_PROTOCOLS.includes(urlLike.protocol);
  }
  return false;
}

/**
 * Checks whether an address is in a passed list of objects with address properties. The check is performed on the
 * lowercased version of the addresses.
 *
 * @param {string} address - The hex address to check
 * @param {Array} list - The array of objects to check
 * @returns {boolean} Whether or not the address is in the list
 */
export function checkExistingAddresses(address, list = []) {
  if (!address) {
    return false;
  }

  const matchesAddress = (obj) => {
    return obj.address.toLowerCase() === address.toLowerCase();
  };

  return list.some(matchesAddress);
}
