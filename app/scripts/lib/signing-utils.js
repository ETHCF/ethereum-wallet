import { toChecksumAddress } from '@ethereumjs/util';

import {
  TYPED_MESSAGE_SCHEMA,
  parseSIWE,
  signTypedData as signTypedDataWithKey,
  validateTypedData as validateTypedDataVersion,
} from './transaction-codec-implementation';

export function validateTypedData(data, version) {
  return validateTypedDataVersion(data, version);
}

export function typedDataSchema() {
  return TYPED_MESSAGE_SCHEMA;
}

export function signTypedData(params) {
  return signTypedDataWithKey(params);
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
