import assert from 'assert';

import {
  formatApprovalAmount,
  getCustomTxParamsData,
} from '../confirm-approve.util';

const SPENDER = '2f318c334780961fb129d2a6c30d0763d9a5c970';
// approve(spender, 2^256 - 1)
const UNLIMITED_APPROVAL = `0x095ea7b3000000000000000000000000${SPENDER}${'f'.repeat(64)}`;

describe('confirm-approve utils', function () {
  describe('getCustomTxParamsData', function () {
    it('encodes a custom amount of 1e21 or more base units', function () {
      // 1000 tokens with 18 decimals is 1e21 base units, which JavaScript writes
      // in exponent form.
      const data = getCustomTxParamsData(UNLIMITED_APPROVAL, {
        customPermissionAmount: '1000',
        decimals: 18,
      });
      assert.equal(
        data,
        `0x095ea7b3000000000000000000000000${SPENDER}${'3635c9adc5dea00000'.padStart(64, '0')}`,
      );
    });

    it('encodes a custom amount below 1e-6 of a base unit token', function () {
      const data = getCustomTxParamsData(UNLIMITED_APPROVAL, {
        customPermissionAmount: '0.0000001',
        decimals: 18,
      });
      // 1e11 base units
      assert.equal(data.slice(-64), '174876e800'.padStart(64, '0'));
    });

    it("encodes with the token's decimals beyond 10^22", function () {
      const data = getCustomTxParamsData(UNLIMITED_APPROVAL, {
        customPermissionAmount: '1',
        decimals: 30,
      });
      assert.equal(
        data.slice(-64),
        (10n ** 30n).toString(16).padStart(64, '0'),
      );
    });

    it('encodes raw units for a token whose decimals are unknown', function () {
      const data = getCustomTxParamsData(UNLIMITED_APPROVAL, {
        customPermissionAmount: '1000',
        decimals: 0,
      });
      assert.equal(data.slice(-64), '3e8'.padStart(64, '0'));
    });

    it('refuses more decimal places than the token has', function () {
      assert.throws(
        () =>
          getCustomTxParamsData(UNLIMITED_APPROVAL, {
            customPermissionAmount: '1.5',
            decimals: 0,
          }),
        /at most 0 decimal places/u,
      );
    });
  });

  describe('formatApprovalAmount', function () {
    const t = (key) => key;

    it('shows the exact amount, never rounded or in exponent form', function () {
      assert.equal(
        formatApprovalAmount('123456789012345678.123456789012345678', 18, t),
        '123456789012345678.123456789012345678',
      );
      assert.equal(
        formatApprovalAmount('1000000000000000000000000', 0, t),
        '1000000000000000000000000',
      );
      assert.equal(formatApprovalAmount('0.0000001', 18, t), '0.0000001');
    });

    it('calls an allowance of 2^128 base units or more unlimited', function () {
      // 2^256 - 1 base units of an 18-decimal token, as most dapps request
      assert.equal(
        formatApprovalAmount(
          '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
          18,
          t,
        ),
        'unlimited',
      );
      assert.equal(
        formatApprovalAmount('340282366920938463463374607431768211456', 0, t),
        'unlimited',
      );
      assert.equal(
        formatApprovalAmount('340282366920938463463374607431768211455', 0, t),
        '340282366920938463463374607431768211455',
      );
    });
  });
});
