import { strict as assert } from 'assert';

import restoreSession from '../../../app/scripts/lib/restore-session';

function fakes({ restore = async () => true, submitPassword } = {}) {
  const calls = [];
  let unlocked = false;
  const encryptor = {
    sessionPassword: 'session',
    restore,
    async clear() {
      calls.push('clear');
    },
  };
  const keyringController = {
    store: { getState: () => ({ vault: 'vault' }) },
    memStore: { getState: () => ({ isUnlocked: unlocked }) },
    async submitPassword(password) {
      calls.push(`submit:${password}`);
      if (submitPassword) {
        unlocked = true;
        await submitPassword();
      }
      unlocked = true;
    },
    async setLocked() {
      calls.push('lock');
      unlocked = false;
    },
  };
  return { encryptor, keyringController, calls, isUnlocked: () => unlocked };
}

describe('restoreSession', function () {
  it('unlocks with the session key', async function () {
    const { encryptor, keyringController, calls } = fakes();
    assert.equal(await restoreSession({ encryptor, keyringController }), true);
    assert.deepEqual(calls, ['submit:session']);
  });

  it('starts locked, and clears the session, when it has expired', async function () {
    const { encryptor, keyringController, calls } = fakes();
    assert.equal(
      await restoreSession({
        encryptor,
        keyringController,
        sessionExpired: true,
      }),
      false,
    );
    assert.deepEqual(calls, ['clear']);
  });

  it('starts locked instead of failing when the session cannot be restored', async function () {
    const unreadable = fakes({
      restore: async () => {
        throw new Error('session storage unavailable');
      },
    });
    assert.equal(await restoreSession(unreadable), false);
    assert.deepEqual(unreadable.calls, ['clear']);

    const halfUnlocked = fakes({
      submitPassword: async () => {
        throw new Error('vault changed');
      },
    });
    assert.equal(await restoreSession(halfUnlocked), false);
    assert.deepEqual(halfUnlocked.calls, ['submit:session', 'lock', 'clear']);
    assert.equal(halfUnlocked.isUnlocked(), false);
  });
});
