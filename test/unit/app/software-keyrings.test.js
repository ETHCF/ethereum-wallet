import { strict as assert } from 'assert';
import sinon from 'sinon';

import {
  createSoftwareKeyring,
  getSoftwareKeyringTypes,
  HD_KEY_TREE,
  mnemonicToString,
  serializeKeyring,
  SIMPLE_KEY_PAIR,
} from '../../../app/scripts/lib/software-keyrings';

const TEST_SEED =
  'debris dizzy just program just float decrease vacant alarm reduce speak stadium';
const TEST_ADDRESS = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc';

describe('software keyrings', function () {
  it('offers the simple and HD keyrings under their vault names', function () {
    const types = getSoftwareKeyringTypes().map((Keyring) => Keyring.type);
    assert.deepEqual(types.sort(), [HD_KEY_TREE, SIMPLE_KEY_PAIR].sort());
  });

  describe('createSoftwareKeyring', function () {
    it('deserializes the given data', async function () {
      const deserialize = sinon.stub().resolves();
      const Keyring = function () {
        this.deserialize = deserialize;
      };
      const keyring = await createSoftwareKeyring(Keyring, { some: 'data' });
      assert.ok(keyring instanceof Keyring);
      assert.deepEqual(deserialize.args, [[{ some: 'data' }]]);
    });

    it('leaves a keyring without data empty', async function () {
      const deserialize = sinon.stub().resolves();
      const Keyring = function () {
        this.deserialize = deserialize;
      };
      await createSoftwareKeyring(Keyring);
      assert.equal(deserialize.called, false);
    });

    it('restores a real HD keyring from its vault form', async function () {
      const HdKeyring = getSoftwareKeyringTypes().find(
        (Keyring) => Keyring.type === HD_KEY_TREE,
      );
      const keyring = await createSoftwareKeyring(HdKeyring, {
        mnemonic: TEST_SEED,
        numberOfAccounts: 1,
      });
      assert.deepEqual(await keyring.getAccounts(), [TEST_ADDRESS]);

      const serialized = await serializeKeyring(keyring);
      assert.equal(serialized.mnemonic, TEST_SEED);
      assert.equal(serialized.numberOfAccounts, 1);
    });
  });

  describe('mnemonicToString', function () {
    it('accepts a string or UTF-8 bytes', function () {
      assert.equal(mnemonicToString(TEST_SEED), TEST_SEED);
      assert.equal(
        mnemonicToString(new TextEncoder().encode(TEST_SEED)),
        TEST_SEED,
      );
      assert.equal(
        mnemonicToString(Array.from(Buffer.from(TEST_SEED))),
        TEST_SEED,
      );
    });
  });

  describe('serializeKeyring', function () {
    it('stores an HD mnemonic as a string', async function () {
      const keyring = {
        type: HD_KEY_TREE,
        serialize: async () => ({
          mnemonic: Array.from(Buffer.from(TEST_SEED)),
          numberOfAccounts: 2,
        }),
      };
      assert.deepEqual(await serializeKeyring(keyring), {
        mnemonic: TEST_SEED,
        numberOfAccounts: 2,
      });
    });

    it('leaves other keyrings as they serialize', async function () {
      const data = ['0x1234'];
      const keyring = { type: SIMPLE_KEY_PAIR, serialize: async () => data };
      assert.equal(await serializeKeyring(keyring), data);

      const empty = { type: HD_KEY_TREE, serialize: async () => ({}) };
      assert.deepEqual(await serializeKeyring(empty), {});
    });
  });
});
