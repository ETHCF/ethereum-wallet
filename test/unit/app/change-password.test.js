import * as passworder from '@metamask/browser-passworder';
import { strict as assert } from 'assert';
import { webcrypto } from 'crypto';

import browserGlobal from '../../../app/scripts/lib/browser-global';
import KeyringController from '../../../app/scripts/lib/modern-keyring-controller';
import restoreSession from '../../../app/scripts/lib/restore-session';
import SessionEncryptor from '../../../app/scripts/lib/session-encryptor';

const OLD_PASSWORD = 'old-password';
const NEW_PASSWORD = 'new-password';
const SESSION_KEY = 'ecfWalletVaultKey';
const MNEMONIC =
  'debris dizzy just program just float decrease vacant alarm reduce speak stadium';
const privateKey = Buffer.alloc(32, 1).toString('hex');
const contents = [{ type: 'Simple Key Pair', data: [privateKey] }];

function sessionStorage(values) {
  return {
    get: async (key) => ({ [key]: values[key] }),
    set: async (data) => Object.assign(values, data),
    remove: async (key) => {
      delete values[key];
    },
    setAccessLevel: async () => undefined,
  };
}

// Wires the controller to its encryptor as background.js does.
function startWallet(values, vault) {
  const encryptor = new SessionEncryptor(sessionStorage(values));
  const controller = new KeyringController({
    initState: { vault },
    encryptor,
  });
  controller.on('lock', () => encryptor.clear());
  controller.memStore.subscribe(({ isUnlocked }) => {
    if (isUnlocked) {
      encryptor.save();
    }
  });
  controller.store.subscribe(() => {
    if (controller.memStore.getState().isUnlocked) {
      encryptor.save();
    }
  });
  return { controller, encryptor };
}

async function settle(controller, encryptor) {
  await controller.vaultWrites;
  await encryptor.writes;
}

async function unlockedWallet() {
  const values = {};
  const vault = await new SessionEncryptor().encrypt(OLD_PASSWORD, contents);
  const { controller, encryptor } = startWallet(values, vault);
  await controller.submitPassword(OLD_PASSWORD);
  await settle(controller, encryptor);
  return { controller, encryptor, values, vault };
}

const decryptWith = (password, vault) =>
  new SessionEncryptor().decrypt(password, vault);

async function assertUnchanged({ controller, encryptor, values, vault }) {
  await settle(controller, encryptor);
  assert.equal(controller.store.getState().vault, vault);
  assert.equal(controller.password, OLD_PASSWORD);
  assert.equal(encryptor.cached.salt, JSON.parse(vault).salt);
  assert.equal(values[SESSION_KEY].salt, JSON.parse(vault).salt);
  // Later saves still use the old password, and it still unlocks the wallet.
  await controller.persistAllKeyrings();
  const saved = controller.store.getState().vault;
  assert.deepEqual(await decryptWith(OLD_PASSWORD, saved), contents);
  await controller.setLocked();
  await controller.submitPassword(OLD_PASSWORD);
  assert.equal((await controller.getAccounts()).length, 1);
}

describe('Changing the wallet password', function () {
  let cryptoDescriptor;
  this.timeout(30000);

  before(function () {
    cryptoDescriptor = Object.getOwnPropertyDescriptor(browserGlobal, 'crypto');
    Object.defineProperty(browserGlobal, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  });

  after(function () {
    Object.defineProperty(browserGlobal, 'crypto', cryptoDescriptor);
  });

  it('re-encrypts the vault with a fresh salt so only the new password unlocks it', async function () {
    const { controller, encryptor, vault } = await unlockedWallet();
    await controller.changePassword(OLD_PASSWORD, NEW_PASSWORD);
    const changed = controller.store.getState().vault;
    assert.notEqual(JSON.parse(changed).salt, JSON.parse(vault).salt);
    assert.equal(controller.password, NEW_PASSWORD);
    assert.deepEqual(await decryptWith(NEW_PASSWORD, changed), contents);
    await assert.rejects(decryptWith(OLD_PASSWORD, changed));

    await controller.setLocked();
    await assert.rejects(controller.submitPassword(OLD_PASSWORD));
    assert.equal(controller.memStore.getState().isUnlocked, false);
    await controller.submitPassword(NEW_PASSWORD);
    assert.equal(controller.memStore.getState().isUnlocked, true);
    assert.equal((await controller.getAccounts()).length, 1);
    await settle(controller, encryptor);
  });

  it('replaces the stored session key, so a restarted wallet restores with the new key only', async function () {
    const { controller, encryptor, values } = await unlockedWallet();
    const oldSessionKey = values[SESSION_KEY];

    // Restart, then change the password from the restored session.
    const restarted = startWallet(values, controller.store.getState().vault);
    assert.equal(
      await restoreSession({
        encryptor: restarted.encryptor,
        keyringController: restarted.controller,
        sessionExpired: false,
      }),
      true,
    );
    await settle(restarted.controller, restarted.encryptor);
    await restarted.controller.changePassword(OLD_PASSWORD, NEW_PASSWORD);
    const changed = restarted.controller.store.getState().vault;

    // changePassword stores the new key itself before it resolves.
    assert.equal(values[SESSION_KEY].salt, JSON.parse(changed).salt);
    assert.notDeepEqual(values[SESSION_KEY].key, oldSessionKey.key);
    const oldKey = await webcrypto.subtle.importKey(
      'jwk',
      oldSessionKey.key,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt'],
    );
    await assert.rejects(
      passworder.decryptWithKey(oldKey, JSON.parse(changed)),
    );

    // A second restart restores with the new key, and saves stay readable
    // with the new password.
    await settle(restarted.controller, restarted.encryptor);
    const again = startWallet(values, changed);
    assert.equal(
      await restoreSession({
        encryptor: again.encryptor,
        keyringController: again.controller,
        sessionExpired: false,
      }),
      true,
    );
    assert.equal((await again.controller.getAccounts()).length, 1);
    await again.controller.persistAllKeyrings();
    assert.deepEqual(
      await decryptWith(NEW_PASSWORD, again.controller.store.getState().vault),
      contents,
    );
    await settle(again.controller, again.encryptor);
    await settle(controller, encryptor);
  });

  it('rejects a wrong current password and keeps the old vault', async function () {
    const wallet = await unlockedWallet();
    await assert.rejects(
      wallet.controller.changePassword('wrong-password', NEW_PASSWORD),
      { message: 'Incorrect password.' },
    );
    await assertUnchanged(wallet);
  });

  it('rejects a new password that is too short, or the same as the current one', async function () {
    const wallet = await unlockedWallet();
    await assert.rejects(
      wallet.controller.changePassword(OLD_PASSWORD, 'short'),
      /at least 8 characters/u,
    );
    await assert.rejects(
      wallet.controller.changePassword(OLD_PASSWORD, null),
      /Password must be text/u,
    );
    await assert.rejects(
      wallet.controller.changePassword(OLD_PASSWORD, OLD_PASSWORD),
      /must differ/u,
    );
    await assertUnchanged(wallet);
  });

  it('refuses while the wallet is locked', async function () {
    const { controller, vault } = await unlockedWallet();
    await controller.setLocked();
    await assert.rejects(
      controller.changePassword(OLD_PASSWORD, NEW_PASSWORD),
      /Unlock the wallet/u,
    );
    assert.equal(controller.store.getState().vault, vault);
  });

  it('is cancelled by a Lock that happens while it is encrypting', async function () {
    const { controller, encryptor, vault } = await unlockedWallet();
    const encrypt = encryptor.encryptWithNewPassword.bind(encryptor);
    let locking;
    encryptor.encryptWithNewPassword = async (...args) => {
      const result = await encrypt(...args);
      locking = controller.setLocked();
      return result;
    };
    await assert.rejects(
      controller.changePassword(OLD_PASSWORD, NEW_PASSWORD),
      /cancelled/u,
    );
    await locking;
    assert.equal(controller.store.getState().vault, vault);
    await controller.submitPassword(OLD_PASSWORD);
    assert.equal(controller.memStore.getState().isUnlocked, true);
  });

  it('keeps the old vault, key and password when encryption fails', async function () {
    const wallet = await unlockedWallet();
    const encrypt = wallet.encryptor.encryptWithNewPassword.bind(
      wallet.encryptor,
    );
    wallet.encryptor.encryptWithNewPassword = async (...args) => {
      await encrypt(...args);
      throw new Error('Encryption failed');
    };
    await assert.rejects(
      wallet.controller.changePassword(OLD_PASSWORD, NEW_PASSWORD),
      /Encryption failed/u,
    );
    await assertUnchanged(wallet);
  });

  it('rolls back the session key and password when storing the vault fails', async function () {
    const wallet = await unlockedWallet();
    const { store } = wallet.controller;
    const updateState = store.updateState.bind(store);
    let failed = false;
    store.updateState = (state) => {
      if (!failed) {
        failed = true;
        throw new Error('Storage failed');
      }
      return updateState(state);
    };
    await assert.rejects(
      wallet.controller.changePassword(OLD_PASSWORD, NEW_PASSWORD),
      /Storage failed/u,
    );
    store.updateState = updateState;
    await assertUnchanged(wallet);
  });

  it('encrypts saves queued behind a password change with the new password', async function () {
    const { controller, encryptor } = await unlockedWallet();
    const changing = controller.changePassword(OLD_PASSWORD, NEW_PASSWORD);
    const adding = controller.addNewKeyring('Simple Key Pair', [
      Buffer.alloc(32, 2).toString('hex'),
    ]);
    await Promise.all([changing, adding]);
    await settle(controller, encryptor);
    const keyrings = await decryptWith(
      NEW_PASSWORD,
      controller.store.getState().vault,
    );
    assert.equal(keyrings.length, 2);
  });

  it('refuses short passwords when creating or restoring a vault', async function () {
    const controller = new KeyringController();
    await assert.rejects(
      controller.createNewVaultAndKeychain('short'),
      /at least 8 characters/u,
    );
    assert.throws(
      () => controller.assertRestorable('short', MNEMONIC),
      /at least 8 characters/u,
    );
    await assert.rejects(
      controller.createNewVaultAndRestore('short', MNEMONIC),
      /at least 8 characters/u,
    );
    assert.equal(controller.store.getState().vault, undefined);
    assert.equal(controller.memStore.getState().isUnlocked, false);
  });
});
