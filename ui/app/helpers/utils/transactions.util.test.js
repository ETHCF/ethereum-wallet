import assert from 'assert';
import { MethodRegistry } from 'eth-method-registry';
import nock from 'nock';
import sinon from 'sinon';

import * as utils from './transactions.util';

describe('Transactions utils', function () {
  describe('getMethodDataAsync', function () {
    let fourByte;
    let savedProvider;

    before(function () {
      // The registry is created once, with the page's provider.
      savedProvider = global.ethereumProvider;
      global.ethereumProvider = { sendAsync: () => undefined };
    });

    after(function () {
      global.ethereumProvider = savedProvider;
    });

    beforeEach(function () {
      fourByte = nock('https://www.4byte.directory')
        .get('/api/v1/signatures/')
        .query(true)
        .reply(200, {
          count: 1,
          results: [{ text_signature: 'mintTokens(uint256)' }],
        });
    });

    afterEach(function () {
      sinon.restore();
      nock.cleanAll();
    });

    it('asks 4byte.directory only for methods the registry does not know', async function () {
      sinon.stub(MethodRegistry.prototype, 'lookup').resolves('swap(uint256)');
      const { name } = await utils.getMethodDataAsync('0x94b918de', true);
      assert.equal(name, 'Swap');
      assert.equal(fourByte.isDone(), false);
    });

    it('asks 4byte.directory for unknown methods when allowed', async function () {
      sinon.stub(MethodRegistry.prototype, 'lookup').resolves('');
      const { name } = await utils.getMethodDataAsync('0x0d4d1513', true);
      assert.equal(name, 'Mint Tokens');
      assert.equal(fourByte.isDone(), true);
    });

    it('never asks 4byte.directory when the user turned it off', async function () {
      const lookup = sinon
        .stub(MethodRegistry.prototype, 'lookup')
        .resolves('');
      assert.deepEqual(await utils.getMethodDataAsync('0x0d4d1513', false), {});
      assert.equal(lookup.calledOnce, true);
      assert.equal(fourByte.isDone(), false);
    });
  });

  describe('getTokenData', function () {
    it('should return token data', function () {
      const tokenData = utils.getTokenData(
        '0xa9059cbb00000000000000000000000050a9d56c2b8ba9a5c7f2c08c3d26e0499f23a7060000000000000000000000000000000000000000000000000000000000004e20',
      );
      assert.ok(tokenData);
      const { name, params } = tokenData;
      assert.equal(name, 'transfer');
      const [to, value] = params;
      assert.equal(to.name, '_to');
      assert.equal(to.type, 'address');
      assert.equal(value.name, '_value');
      assert.equal(value.type, 'uint256');
    });

    it('should not throw errors when called without arguments', function () {
      assert.doesNotThrow(() => utils.getTokenData());
    });
  });

  describe('getStatusKey', function () {
    it('should return the correct status', function () {
      const tests = [
        {
          transaction: {
            status: 'confirmed',
            txReceipt: {
              status: '0x0',
            },
          },
          expected: 'failed',
        },
        {
          transaction: {
            status: 'confirmed',
            txReceipt: {
              status: '0x1',
            },
          },
          expected: 'confirmed',
        },
        {
          transaction: {
            status: 'pending',
          },
          expected: 'pending',
        },
      ];

      tests.forEach(({ transaction, expected }) => {
        assert.equal(utils.getStatusKey(transaction), expected);
      });
    });
  });
});
