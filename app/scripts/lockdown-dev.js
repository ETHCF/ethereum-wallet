/* global lockdown */
/* eslint-disable import-x/unambiguous */
// Development builds run without LavaMoat, which otherwise locks down the
// bundle, so they call lockdown here, before any other module.
try {
  lockdown(process.env.LOCKDOWN_OPTIONS);
} catch (error) {
  // Fail open so the wallet still starts, but make the failure visible.
  console.error('ECF Wallet: lockdown failed', error);
}
