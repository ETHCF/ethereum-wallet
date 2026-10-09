/**
 * When the wallet locks itself after being left inactive.
 *
 * @param {object} appState - The AppStateController state.
 * @param {number} [appState.timeoutMinutes] - The auto-lock timeout, if set.
 * @param {number} appState.lastActiveTime - When the user was last active.
 * @returns {number | null} The time to lock at, or null if auto-lock is off.
 */
export function getAutoLockDeadline({ timeoutMinutes, lastActiveTime }) {
  return timeoutMinutes ? lastActiveTime + timeoutMinutes * 60000 : null;
}
