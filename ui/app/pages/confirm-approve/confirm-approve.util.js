import { BigNumber } from 'bignumber.js';

import { decimalToHex } from '../../helpers/utils/conversions.util';
import { calcTokenValue } from '../../helpers/utils/token-util';
import { getTokenData } from '../../helpers/utils/transactions.util';

export function getCustomTxParamsData(
  data,
  { customPermissionAmount, decimals },
) {
  const tokenData = getTokenData(data);

  if (!tokenData) {
    throw new Error('Invalid data');
  } else if (tokenData.name !== 'approve') {
    throw new Error(
      `Invalid data; should be 'approve' method, but instead is '${tokenData.name}'`,
    );
  }
  let spender = tokenData.params[0].value;
  if (spender.startsWith('0x')) {
    spender = spender.substring(2);
  }
  const [signature, tokenValue] = data.split(spender);

  if (!signature || !tokenValue) {
    throw new Error('Invalid data');
  } else if (tokenValue.length !== 64) {
    throw new Error(
      'Invalid token value; should be exactly 64 hex digits long (u256)',
    );
  }

  let customPermissionValue = decimalToHex(
    calcTokenValue(customPermissionAmount, decimals),
  );
  if (customPermissionValue.length > 64) {
    throw new Error('Custom value is larger than u256');
  }

  customPermissionValue = customPermissionValue.padStart(
    tokenValue.length,
    '0',
  );
  const customTxParamsData = `${signature}${spender}${customPermissionValue}`;
  return customTxParamsData;
}

// Allowances at or above 2^128 base units are far beyond any real token
// supply, so they amount to an unlimited allowance, as the background's
// security checks also treat them.
const UNLIMITED_BASE_UNITS = new BigNumber(2).pow(128);

/**
 * Formats an allowance for the user to approve: the exact amount, never
 * rounded or in exponent form, or "Unlimited" for one that is unlimited in
 * effect.
 *
 * @param {string} amount - The allowance in whole tokens, as a decimal string
 * @param {number} decimals - The token's decimals
 * @param {Function} t - Translates a locale key
 * @returns {string} The amount to show
 */
export function formatApprovalAmount(amount, decimals, t) {
  if (!amount) {
    return '';
  }
  try {
    if (calcTokenValue(amount, decimals).gte(UNLIMITED_BASE_UNITS)) {
      return t('unlimited');
    }
    return new BigNumber(amount).toFixed();
  } catch (_) {
    return String(amount);
  }
}
