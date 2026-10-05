/* global Compartment */
/* eslint-disable import-x/unambiguous */
// Lockdown freezes the intrinsics but leaves the global object writable, so
// `globalThis.Promise = Evil` would still replace them for later code. This
// makes each JavaScript intrinsic global non-writable and non-configurable.
// Platform globals (window, chrome, fetch, ...) are left alone.
try {
  const intrinsicNames = Reflect.ownKeys(new Compartment().globalThis)
    // Compartment-only helpers and the globals themselves are not intrinsics.
    .filter(
      (name) =>
        ![
          'globalThis',
          'eval',
          'Compartment',
          'harden',
          'lockdown',
          'assert',
        ].includes(name),
    );
  for (const name of intrinsicNames) {
    const descriptor = Reflect.getOwnPropertyDescriptor(globalThis, name);
    if (descriptor?.configurable) {
      if (Object.hasOwn(descriptor, 'value')) {
        Object.defineProperty(globalThis, name, {
          configurable: false,
          writable: false,
        });
      } else {
        Object.defineProperty(globalThis, name, { configurable: false });
      }
    }
  }
} catch (error) {
  console.error('ECF Wallet: protecting intrinsics failed', error);
}
