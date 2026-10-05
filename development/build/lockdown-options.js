// SES lockdown options for every sandboxed bundle. LavaMoat applies them in
// production and test builds; development builds, which run without LavaMoat,
// pass them to lockdown themselves (app/scripts/lockdown-dev.js).
//
// Lockdown freezes the JavaScript intrinsics (Object, Array, Promise, their
// prototypes, ...), so a compromised dependency cannot tamper with built-ins
// that wallet code relies on, for example to intercept keys or transaction data.
module.exports = {
  // Keep native console and error stacks for debugging.
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
  // Let existing code assign properties that shadow frozen prototype
  // properties (for example `toString`), instead of throwing.
  overrideTaming: 'severe',
  // Replace eval and the Function constructor, in every compartment, with
  // versions that throw. The content security policy forbids them as well,
  // but this does not depend on it, and nothing in the wallet evaluates code.
  // Builds for the e2e tests allow it (see webpack.config.js).
  evalTaming: 'no-eval',
  // Babel's bundled regenerator-runtime writes to the iterator prototype.
  legacyRegeneratorRuntimeTaming: 'unsafe-ignore',
  // Leave error and rejection handling to the wallet.
  errorTrapping: 'none',
  unhandledRejectionTrapping: 'none',
  localeTaming: 'unsafe',
};
