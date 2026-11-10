import { strict as assert } from 'assert';

import * as txUtils from '../../../../../app/scripts/controllers/transactions/lib/util';

describe('txUtils', function () {
  describe('#validateTxParams', function () {
    it('does not throw for positive values', function () {
      const sample = {
        from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
        to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
        value: '0x01',
      };
      txUtils.validateTxParams(sample);
    });

    it('returns error for negative or fractional values', function () {
      for (const value of ['-0x01', '0x1.5']) {
        assert.throws(
          () =>
            txUtils.validateTxParams({
              from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
              to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
              value,
            }),
          /Invalid value: expected a hexadecimal quantity/u,
        );
      }
    });

    it('refuses amounts that are not hexadecimal, or are empty', function () {
      for (const field of ['nonce', 'value', 'gas', 'gasPrice']) {
        for (const amount of ['0x12g', '0x']) {
          assert.throws(
            () =>
              txUtils.validateTxParams({
                from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
                to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
                [field]: amount,
              }),
            new RegExp(`Invalid ${field}`, 'u'),
          );
        }
      }
    });

    describe('size limits', function () {
      const base = {
        from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
        to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
      };
      const dataOf = (bytes) => `0x${'ab'.repeat(bytes)}`;

      it('accepts data up to the limit and refuses more', function () {
        txUtils.validateTxParams({
          ...base,
          data: dataOf(txUtils.MAX_TX_PAYLOAD_BYTES),
        });
        assert.throws(
          () =>
            txUtils.validateTxParams({
              ...base,
              data: dataOf(txUtils.MAX_TX_PAYLOAD_BYTES + 1),
            }),
          /too large/u,
        );
      });

      it('counts the access list toward the limit', function () {
        const accessList = [
          {
            address: base.to,
            storageKeys: [`0x${'1'.repeat(64)}`],
          },
        ];
        txUtils.validateTxParams({
          ...base,
          accessList,
          data: dataOf(txUtils.MAX_TX_PAYLOAD_BYTES - 52),
        });
        assert.throws(
          () =>
            txUtils.validateTxParams({
              ...base,
              accessList,
              data: dataOf(txUtils.MAX_TX_PAYLOAD_BYTES - 51),
            }),
          /too large/u,
        );
      });

      it('refuses a quantity wider than 32 bytes', function () {
        txUtils.validateTxParams({ ...base, value: `0x${'f'.repeat(64)}` });
        assert.throws(
          () =>
            txUtils.validateTxParams({ ...base, value: `0x${'f'.repeat(65)}` }),
          /Invalid value/u,
        );
      });
    });

    it('refuses data that is not whole hexadecimal bytes', function () {
      // approve(spender, max) with its leading zero nibble dropped: checks
      // would read selector 0x95ea7b30, the signer would pad it to approve.
      const oddApprove = `0x95ea7b3${'0'.repeat(24)}${'12345'.repeat(8)}${'f'.repeat(64)}`;
      for (const data of [oddApprove, '0x1', '0x12g4', '0X1234', '1234']) {
        assert.throws(
          () =>
            txUtils.validateTxParams({
              from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
              to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
              data,
            }),
          /Invalid data: expected hexadecimal bytes/u,
        );
      }
    });

    it('accepts data that is whole hexadecimal bytes', function () {
      for (const data of ['0x', '0x095ea7b3', '0xABcd']) {
        txUtils.validateTxParams({
          from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
          data,
        });
      }
    });
  });

  describe('#normalizeTxParams', function () {
    // A number is signed as decimal but shown as hex, so 1000 wei would be
    // displayed as 4096.
    it('refuses amounts given as numbers', function () {
      for (const field of ['nonce', 'value', 'gas', 'gasPrice', 'data']) {
        assert.throws(
          () =>
            txUtils.normalizeTxParams({
              from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
              to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
              [field]: 1000,
            }),
          new RegExp(`Invalid ${field}: expected a hexadecimal string`, 'u'),
        );
      }
    });

    it('accepts hex strings, and omits zero numbers', function () {
      const normalized = txUtils.normalizeTxParams({
        from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
        to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
        value: '3e8',
        nonce: 0,
      });
      assert.equal(normalized.value, '0x3e8');
      assert.equal(normalized.nonce, undefined);
    });

    it('converts a numeric or decimal chainId to hex', function () {
      const from = '0xa7df1bedbf813f57096df77fcd515f0b3900e402';
      for (const chainId of [4663, '4663', '0x1237']) {
        const normalized = txUtils.normalizeTxParams({
          from,
          to: from,
          chainId,
        });
        assert.equal(normalized.chainId, '0x1237');
        txUtils.validateTxParams(normalized);
      }
      for (const chainId of [0, -1, 1.5, '0', '01', 'abc', {}]) {
        const normalized = txUtils.normalizeTxParams({
          from,
          to: from,
          chainId,
        });
        assert.throws(() => txUtils.validateTxParams(normalized), /chainId/u);
      }
      assert.equal(
        Reflect.has(txUtils.normalizeTxParams({ from }), 'chainId'),
        false,
      );
    });

    it('should normalize txParams', function () {
      const txParams = {
        chainId: '0x1',
        from: 'a7df1beDBF813f57096dF77FCd515f0B3900e402',
        to: null,
        data: '68656c6c6f20776f726c64',
        random: 'hello world',
      };

      let normalizedTxParams = txUtils.normalizeTxParams(txParams);

      assert.equal(
        normalizedTxParams.chainId,
        '0x1',
        'chainId must be preserved for validation',
      );
      assert.ok(
        !normalizedTxParams.to,
        'there should be no to address if null',
      );
      assert.equal(
        normalizedTxParams.from.slice(0, 2),
        '0x',
        'from should be hex-prefixed',
      );
      assert.equal(
        normalizedTxParams.data.slice(0, 2),
        '0x',
        'data should be hex-prefixed',
      );
      assert.ok(
        !Reflect.has(normalizedTxParams, 'random'),
        'there should be no random key in normalizedTxParams',
      );

      txParams.to = 'a7df1beDBF813f57096dF77FCd515f0B3900e402';
      normalizedTxParams = txUtils.normalizeTxParams(txParams);
      assert.equal(
        normalizedTxParams.to.slice(0, 2),
        '0x',
        'to should be hex-prefixed',
      );
    });
  });

  describe('#validateRecipient', function () {
    it('removes recipient for txParams with 0x when contract data is provided', function () {
      const zeroRecipientDataTxParams = {
        from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
        to: '0x',
        data: 'bytecode',
      };
      const sanitizedTxParams = txUtils.validateRecipient(
        zeroRecipientDataTxParams,
      );
      assert.deepEqual(
        sanitizedTxParams,
        {
          from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          data: 'bytecode',
        },
        'no recipient with 0x',
      );
    });

    it('should error when recipient is 0x', function () {
      const zeroRecipientTxParams = {
        from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
        to: '0x',
      };
      assert.throws(
        () => {
          txUtils.validateRecipient(zeroRecipientTxParams);
        },
        Error,
        'Invalid recipient address',
      );
    });

    it('errors when there is neither a recipient nor contract data', function () {
      // That would create an empty contract and lose any value sent.
      for (const params of [
        { value: '0x1' },
        { to: undefined, data: '0x', value: '0x1' },
        { to: '0x', data: '0x' },
        { to: null, data: '' },
      ]) {
        assert.throws(
          () =>
            txUtils.validateRecipient({
              from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
              ...params,
            }),
          /Invalid recipient address/u,
        );
      }
    });

    it('allows contract creation without a recipient', function () {
      const txParams = txUtils.validateRecipient({
        from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
        data: '0x6080',
      });
      assert.equal(txParams.data, '0x6080');
    });
  });

  describe('#validateFrom', function () {
    it('should error when from is not a hex string', function () {
      // where from is undefined
      const txParams = {};
      assert.throws(
        () => {
          txUtils.validateFrom(txParams);
        },
        Error,
        `Invalid from address ${txParams.from} not a string`,
      );

      // where from is array
      txParams.from = [];
      assert.throws(
        () => {
          txUtils.validateFrom(txParams);
        },
        Error,
        `Invalid from address ${txParams.from} not a string`,
      );

      // where from is a object
      txParams.from = {};
      assert.throws(
        () => {
          txUtils.validateFrom(txParams);
        },
        Error,
        `Invalid from address ${txParams.from} not a string`,
      );

      // where from is a invalid address
      txParams.from = 'im going to fail';
      assert.throws(
        () => {
          txUtils.validateFrom(txParams);
        },
        Error,
        `Invalid from address`,
      );

      // should run
      txParams.from = '0x1678a085c290ebd122dc42cba69373b5953b831d';
      txUtils.validateFrom(txParams);
    });
  });
});
