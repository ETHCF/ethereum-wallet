import assert from 'assert';

import {
  calcTokenAmount,
  calcTokenValue,
  fetchSymbolAndDecimals,
  fetchTokenDetails,
  resolveTokenDetails,
} from './token-util';

describe('token-util', function () {
  describe('calcTokenAmount and calcTokenValue', function () {
    it('convert exactly, beyond Number and division precision', function () {
      assert.equal(
        calcTokenAmount(
          '115792089237316195423570985008687907853269984665640564039457584007913129639935',
          18,
        ).toFixed(),
        '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
      );
      assert.equal(
        calcTokenAmount('1', 30).toFixed(),
        '0.000000000000000000000000000001',
      );
      assert.equal(
        calcTokenValue('1.5', 24).toFixed(),
        '1500000000000000000000000',
      );
      assert.equal(calcTokenAmount('12345', undefined).toFixed(), '12345');
    });
  });

  describe('resolveTokenDetails', function () {
    it("prefers the tracked token's details", function () {
      assert.deepEqual(
        resolveTokenDetails({
          trackedToken: { symbol: 'USDC', decimals: 6 },
          fetched: { symbol: 'X', decimals: '18' },
        }),
        { symbol: 'USDC', decimals: 6, known: true },
      );
    });

    it('uses details read from the contract for an untracked token', function () {
      assert.deepEqual(
        resolveTokenDetails({ fetched: { symbol: 'TKN', decimals: '0' } }),
        { symbol: 'TKN', decimals: 0, known: true },
      );
    });

    it('treats a token without decimals as unknown, in raw units', function () {
      assert.deepEqual(
        resolveTokenDetails({
          trackedToken: undefined,
          fetched: { symbol: 'TKN' },
        }),
        { symbol: undefined, decimals: 0, known: false },
      );
      assert.deepEqual(resolveTokenDetails(), {
        symbol: undefined,
        decimals: 0,
        known: false,
      });
    });
  });

  describe('fetchTokenDetails', function () {
    it('leaves out what the contract does not answer', async function () {
      const originalEthQuery = global.ethQuery;
      global.ethQuery = {
        call: (_txParams, _block, callback) =>
          (callback || _block)(new Error('execution reverted')),
      };
      const address = '0x9999999999999999999999999999999999999999';
      assert.deepEqual(await fetchTokenDetails(address), {
        symbol: undefined,
        decimals: undefined,
      });
      // The older helper keeps its defaults for the add-token form.
      assert.deepEqual(await fetchSymbolAndDecimals(address), {
        symbol: '',
        decimals: '0',
      });
      global.ethQuery = originalEthQuery;
    });
  });
});
