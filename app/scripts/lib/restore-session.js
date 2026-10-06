import log from 'loglevel';

/**
 * Unlocks the wallet with the session key from an earlier service worker, if
 * the session has not expired. It runs on every service worker start, so it
 * must not throw: a session that cannot be restored would otherwise keep the
 * wallet from starting until the browser restarts. The wallet starts locked
 * instead.
 *
 * @param {object} options - What to restore.
 * @param {object} options.encryptor - The SessionEncryptor.
 * @param {object} options.keyringController - The keyring controller.
 * @param {boolean} options.sessionExpired - Whether the auto-lock time passed.
 * @returns {Promise<boolean>} Whether the wallet was unlocked.
 */
export default async function restoreSession({
  encryptor,
  keyringController,
  sessionExpired,
}) {
  try {
    if (
      !sessionExpired &&
      (await encryptor.restore(keyringController.store.getState().vault))
    ) {
      await keyringController.submitPassword(encryptor.sessionPassword);
      return true;
    }
  } catch (error) {
    log.error('ecf-wallet - unable to restore the session', error);
    if (keyringController.memStore.getState().isUnlocked) {
      await keyringController.setLocked().catch(log.error);
    }
  }
  await encryptor.clear().catch(log.error);
  return false;
}
