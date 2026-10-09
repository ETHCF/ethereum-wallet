import { toChecksumAddress } from '@ethereumjs/util';

import {
  parseSIWE,
  recoverTypedSignature,
} from './transaction-codec-implementation';

export {
  TYPED_MESSAGE_SCHEMA,
  signTypedData,
  validateTypedData,
} from './transaction-codec-implementation';

const CANONICAL_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const ARRAY_TYPE = /^(.*)\[[0-9]*\]$/u;

function canonicalValue(type, value, types) {
  if (value === undefined || value === null) {
    return value;
  }
  const array = ARRAY_TYPE.exec(type);
  if (array) {
    return Array.isArray(value)
      ? value.map((item) => canonicalValue(array[1], item, types))
      : value;
  }
  if (types && Object.hasOwn(types, type)) {
    return canonicalStruct(type, value, types);
  }
  if (type === 'address') {
    // The encoder also takes short hex and decimal strings as addresses. The
    // user and the wallet's checks would see a different value than is signed.
    if (typeof value !== 'string' || !CANONICAL_ADDRESS.test(value)) {
      throw new Error(`Invalid address value: ${String(value)}`);
    }
    return value;
  }
  if (type === 'bool') {
    // Hardware signers encode with Boolean(value), so "false" would sign as
    // true. Store a real boolean, which every encoder reads the same way.
    if (value === true || value === 'true') {
      return true;
    }
    if (value === false || value === 'false') {
      return false;
    }
    throw new Error(`Invalid bool value: ${String(value)}`);
  }
  return value;
}

function canonicalStruct(type, value, types) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const result = { ...value };
  for (const field of types[type]) {
    if (Object.hasOwn(value, field.name)) {
      result[field.name] = canonicalValue(field.type, value[field.name], types);
    }
  }
  return result;
}

/**
 * Gives typed data the one encoding of its address and bool values that
 * every signer reads identically, so that what is shown and checked is what
 * is signed.
 *
 * @param {object | object[]} data - Parsed typed data (an array for V1).
 * @param {string} version - The typed data version: 'V1', 'V3' or 'V4'.
 * @returns {object | object[]} The data with canonical values.
 * @throws If an address is not 0x and 40 hex digits, or a bool is not a
 * boolean or the string "true" or "false".
 */
export function canonicalizeTypedData(data, version) {
  if (version === 'V1') {
    return data.map((entry) =>
      entry && typeof entry === 'object'
        ? { ...entry, value: canonicalValue(entry.type, entry.value) }
        : entry,
    );
  }
  const { types } = data;
  if (!types || typeof types !== 'object') {
    return data;
  }
  const result = { ...data };
  if (Object.hasOwn(types, 'EIP712Domain')) {
    result.domain = canonicalStruct('EIP712Domain', data.domain, types);
  }
  if (Object.hasOwn(types, data.primaryType)) {
    result.message = canonicalStruct(data.primaryType, data.message, types);
  }
  return result;
}

/**
 * Throws unless a typed-data signature is by the given account over the data
 * as the wallet encodes it. Hardware keyrings bundle their own encoder.
 *
 * @param {object} options - The signature and what it must sign.
 * @param {object | object[]} options.data - The typed data that was shown.
 * @param {string} options.signature - The signature to check.
 * @param {string} options.version - The typed data version.
 * @param {string} options.from - The account that must have signed.
 */
export function assertTypedSignature({ data, signature, version, from }) {
  const signer = recoverTypedSignature({ data, signature, version });
  if (signer.toLowerCase() !== from.toLowerCase()) {
    throw new Error('The signature does not match the approved typed data');
  }
}

// Parse without changing the bytes that will be signed. As in the reference
// wallet, accept unchecksummed accounts in the parser, then compare addresses.
export function detectSIWE({ data, from, origin }, chainId, now = Date.now()) {
  const message = Buffer.from(data.replace(/^0x/u, ''), 'hex').toString('utf8');
  if (!message.includes('wants you to sign in with your Ethereum account:')) {
    return undefined;
  }
  const errors = [];
  const warnings = [];
  let parsedMessage;
  try {
    const lines = message.split('\n');
    lines[1] = toChecksumAddress(lines[1]);
    parsedMessage = parseSIWE(lines.join('\n'));
    parsedMessage.address = message.split('\n')[1];
  } catch (_) {
    return {
      isSIWEMessage: false,
      errors: ['This sign-in message does not conform to SIWE (ERC-4361).'],
      warnings,
    };
  }
  try {
    const requestedOrigin = new URL(
      `${parsedMessage.scheme || 'https'}://${parsedMessage.domain}`,
    );
    const actualOrigin = new URL(origin);
    if (
      !['https:', 'http:'].includes(actualOrigin.protocol) ||
      requestedOrigin.origin !== actualOrigin.origin ||
      requestedOrigin.username ||
      requestedOrigin.password
    ) {
      errors.push(
        'The sign-in domain or scheme does not match the requesting site.',
      );
    }
  } catch (_) {
    errors.push('The sign-in origin cannot be verified.');
  }
  if (parsedMessage.address.toLowerCase() !== from?.toLowerCase()) {
    errors.push('The sign-in account does not match the signing account.');
  }
  if (
    chainId !== undefined &&
    Number(parsedMessage.chainId) !== Number(chainId)
  ) {
    warnings.push('The sign-in network differs from the selected network.');
  }
  if (
    parsedMessage.expirationTime &&
    Date.parse(parsedMessage.expirationTime) <= now
  ) {
    errors.push('This sign-in request has expired.');
  }
  if (parsedMessage.notBefore && Date.parse(parsedMessage.notBefore) > now) {
    errors.push('This sign-in request is not valid yet.');
  }
  return { isSIWEMessage: true, parsedMessage, errors, warnings };
}
