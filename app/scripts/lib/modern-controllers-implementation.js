// These packages use exports without a main field, which ESLint 6 cannot resolve.
// eslint-disable-next-line import/no-unresolved
import { Messenger } from '@metamask/messenger'
// eslint-disable-next-line import/no-unresolved
import { AddressBookController } from '@metamask/address-book-controller'

// Bundled with esbuild and loaded before the background bundle, like the
// transaction codec: these packages are ESM-only, which Browserify cannot load.

/**
 * @param {Object} [state] - The persisted AddressBookController state
 * @returns {{ controller: AddressBookController, store: Object }} The controller
 * and an ObservableStore-like view of its state for ComposableObservableStore.
 */
export function createAddressBookController (state) {
  const messenger = new Messenger({ namespace: 'AddressBookController' })
  const controller = new AddressBookController({ messenger, state })
  return {
    controller,
    store: {
      getState: () => controller.state,
      subscribe: (listener) => messenger.subscribe('AddressBookController:stateChange', (nextState) => listener(nextState)),
    },
  }
}
