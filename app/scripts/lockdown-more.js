/* global Compartment, harden */
/* eslint-disable import-x/unambiguous */
// This runs first in every sandboxed bundle, after lockdown, and throws if
// the protections are missing: an exception here stops the rest of the
// bundle, so the wallet never runs without them. LavaMoat's runtime, finding
// no SES, would otherwise only warn and run every module unconfined.
if (
  typeof harden !== 'function' ||
  typeof Compartment !== 'function' ||
  ![Object.prototype, Array.prototype, Function.prototype, Promise].every(
    (intrinsic) => Object.isFrozen(intrinsic),
  )
) {
  throw new Error(
    'MetaECF: SES lockdown has not run. Refusing to start without it.',
  );
}

// Lockdown freezes the intrinsics but leaves the global object writable, so
// `globalThis.Promise = Evil` would still replace them for later code. This
// makes each JavaScript intrinsic global non-writable and non-configurable.
// Platform globals (window, chrome, fetch, ...) are left alone.
{
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
      // The full descriptor, not just the changed fields: some realms, such
      // as Node's vm contexts, drop the value of a partial redefinition.
      Object.defineProperty(globalThis, name, {
        ...descriptor,
        configurable: false,
        ...(Object.hasOwn(descriptor, 'value') ? { writable: false } : {}),
      });
    }
  }
}
