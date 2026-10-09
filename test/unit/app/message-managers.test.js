import { strict as assert } from 'assert';

import DecryptMessageManager from '../../../app/scripts/lib/decrypt-message-manager';
import EncryptionPublicKeyManager from '../../../app/scripts/lib/encryption-public-key-manager';
import PersonalMessageManager from '../../../app/scripts/lib/personal-message-manager';

const from = `0x${'1'.repeat(40)}`;
const origin = 'https://example.test';

describe('Message managers', function () {
  describe('EncryptionPublicKeyManager', function () {
    it('rejects the dapp request when the request errors', async function () {
      const manager = new EncryptionPublicKeyManager();
      const response = manager.addUnapprovedMessageAsync(from, { origin });
      const [{ id }] = manager.messages;
      manager.errorMessage(id, new Error('Keyring failed'));
      await assert.rejects(response, /Keyring failed/u);
      assert.equal(manager.getMsg(id).status, 'errored');
    });

    it('approves only unapproved requests, with the stored address', async function () {
      const manager = new EncryptionPublicKeyManager();
      const response = manager.addUnapprovedMessageAsync(from, { origin });
      const [{ id }] = manager.messages;
      assert.deepEqual(
        await manager.approveMessage({
          ecfWalletId: id,
          data: `0x${'2'.repeat(40)}`,
        }),
        { data: from },
      );
      await assert.rejects(
        manager.approveMessage({ ecfWalletId: id, data: from }),
        /not awaiting approval/u,
      );
      manager.setMsgStatusReceived(id, 'public key');
      assert.equal(await response, 'public key');
      assert.equal(
        manager.memStore.getState().unapprovedEncryptionPublicKeyMsgCount,
        0,
      );
    });
  });

  describe('DecryptMessageManager', function () {
    it('approves only unapproved requests, with the stored params', async function () {
      const manager = new DecryptMessageManager();
      const response = manager.addUnapprovedMessageAsync(
        { from, data: '0x1234' },
        { origin },
      );
      const [{ id }] = manager.messages;
      assert.equal(manager.unapprovedDecryptMsgCount, 1);
      assert.deepEqual(
        await manager.approveMessage({ ecfWalletId: id, data: '0xabcd' }),
        { from, data: '0x1234', origin },
      );
      await assert.rejects(
        manager.approveMessage({ ecfWalletId: id }),
        /not awaiting approval/u,
      );
      manager.errorMessage(id, new Error('Bad ciphertext'));
      await assert.rejects(response, /This message cannot be decrypted/u);
    });

    it('reads odd-length hex as text', function () {
      const manager = new DecryptMessageManager();
      manager.addUnapprovedMessage({ from, data: '0xabc' });
      assert.equal(manager.messages[0].msgParams.data, '0x3078616263');
    });

    it('requires a from address', async function () {
      await assert.rejects(
        new DecryptMessageManager().addUnapprovedMessageAsync({ data: '0x' }),
        /ecf-wallet Decryption: from field is required\./u,
      );
    });
  });

  describe('PersonalMessageManager', function () {
    it('resolves with the signature and keeps memStore in sync', async function () {
      const manager = new PersonalMessageManager();
      const response = manager.addUnapprovedMessageAsync(
        { from, data: 'hello' },
        { origin },
      );
      const [{ id }] = manager.messages;
      assert.equal(
        manager.memStore.getState().unapprovedPersonalMsgs[id].msgParams.data,
        '0x68656c6c6f',
      );
      assert.equal(manager.unapprovedPersonalMsgCount, 1);
      manager.setMsgStatusSigned(id, '0xsig');
      assert.equal(await response, '0xsig');
      assert.deepEqual(manager.memStore.getState(), {
        unapprovedPersonalMsgs: {},
        unapprovedPersonalMsgCount: 0,
      });
    });

    it('rejects the dapp request when the user rejects it', async function () {
      const manager = new PersonalMessageManager();
      const response = manager.addUnapprovedMessageAsync({ from, data: 'hi' });
      manager.rejectMsg(manager.messages[0].id);
      await assert.rejects(response, /User denied message signature/u);
    });

    it('throws for an unknown message id', function () {
      assert.throws(
        () => new PersonalMessageManager().rejectMsg(7),
        /PersonalMessageManager - Message not found for id: "7"\./u,
      );
    });
  });
});
