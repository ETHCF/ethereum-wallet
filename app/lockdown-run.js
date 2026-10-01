/* global lockdown */
/* eslint-disable import/unambiguous */
// Runs SES lockdown before any other script in this context. Lockdown freezes
// the JavaScript intrinsics (Object, Array, Promise, their prototypes, ...),
// so a compromised dependency cannot tamper with built-ins that wallet code
// relies on, for example to intercept keys or transaction data.
try {
  lockdown({
    // Keep native console and error stacks for debugging.
    consoleTaming: 'unsafe',
    errorTaming: 'unsafe',
    stackFiltering: 'verbose',
    // Let existing code assign properties that shadow frozen prototype
    // properties (for example `toString`), instead of throwing.
    overrideTaming: 'severe',
    // The extension's content security policy already forbids eval and the
    // Function constructor, so SES need not replace them as well. Replacing
    // them would break tooling that evaluates code through the debugger.
    evalTaming: 'unsafe-eval',
    // Babel's bundled regenerator-runtime writes to the iterator prototype.
    legacyRegeneratorRuntimeTaming: 'unsafe-ignore',
    // Leave error and rejection handling to the wallet.
    errorTrapping: 'none',
    unhandledRejectionTrapping: 'none',
    localeTaming: 'unsafe',
  })
} catch (error) {
  // Fail open so the wallet still starts, but make the failure visible.
  console.error('ECF Wallet: lockdown failed', error)
}
