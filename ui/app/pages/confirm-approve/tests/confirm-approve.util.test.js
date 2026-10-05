import assert from 'assert';

import { getCustomTxParamsData } from '../confirm-approve.util';

const SPENDER = '2f318c334780961fb129d2a6c30d0763d9a5c970';
// approve(spender, 2^256 - 1)
const UNLIMITED_APPROVAL = `0x095ea7b3000000000000000000000000${SPENDER}${'f'.repeat(64)}`;

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
});
