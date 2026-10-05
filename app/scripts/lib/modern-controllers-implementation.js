import { AddressBookController } from '@metamask/address-book-controller';
import { Messenger } from '@metamask/messenger';
import {
  PermissionController,
  PermissionType,
  constructPermission,
} from '@metamask/permission-controller';

/**
 * Creates the AddressBookController.
 *
 * @param {object} [state] - The persisted AddressBookController state
 * @returns {{controller: AddressBookController, store: object}} The controller
 * and an ObservableStore-like view of its state for ComposableObservableStore.
 */
export function createAddressBookController(state) {
  const messenger = new Messenger({ namespace: 'AddressBookController' });
  const controller = new AddressBookController({ messenger, state });
  return {
    controller,
    store: {
      getState: () => controller.state,
      subscribe: (listener) =>
        messenger.subscribe('AddressBookController:stateChange', (nextState) =>
          listener(nextState),
        ),
    },
  };
}

export const RESTRICT_RETURNED_ACCOUNTS = 'restrictReturnedAccounts';

const APPROVAL_ACTIONS = [
  'addRequest',
  'hasRequest',
  'acceptRequest',
  'rejectRequest',
];

/**
 * Creates the PermissionController, with the eth_accounts permission.
 *
 * @param {object} options - The controller options.
 * @param {object} [options.state] - The persisted PermissionController state
 * @param {object} options.approval - Shows permission requests to the user:
 * addRequest, hasRequest, acceptRequest and rejectRequest, as on ApprovalController.
 * @param {Function} options.getAllAccounts - Resolves with the wallet's accounts
 * @param {Function} options.getIdentities - Returns the identities by address
 * @param {string[]} options.unrestrictedMethods - Methods that need no permission
 * @returns {{controller: PermissionController, store: object}} The controller
 * and an ObservableStore-like view of its state for ComposableObservableStore.
 */
export function createPermissionController({
  state,
  approval,
  getAllAccounts,
  getIdentities,
  unrestrictedMethods,
}) {
  const messenger = new Messenger({ namespace: 'PermissionController' });
  // The wallet's own connect page handles approvals, through this shim.
  const approvalMessenger = new Messenger({ namespace: 'ApprovalController' });
  for (const action of APPROVAL_ACTIONS) {
    approvalMessenger.registerActionHandler(
      `ApprovalController:${action}`,
      (...args) => approval[action](...args),
    );
  }
  approvalMessenger.delegate({
    messenger,
    actions: APPROVAL_ACTIONS.map((action) => `ApprovalController:${action}`),
  });

  const validateAccounts = (accounts) => {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('Must provide non-empty array of account(s).');
    }
    const identities = getIdentities();
    accounts.forEach((account) => {
      if (!identities[account]) {
        throw new Error(`Unknown account: ${account}`);
      }
    });
  };

  const controller = new PermissionController({
    messenger,
    state,
    unrestrictedMethods,
    caveatSpecifications: {
      [RESTRICT_RETURNED_ACCOUNTS]: {
        type: RESTRICT_RETURNED_ACCOUNTS,
        // Sites see only the primary (most recently selected) permitted account.
        decorator: (method, caveat) => async (args) => {
          const accounts = await method(args);
          return accounts
            .filter((account) => caveat.value.includes(account))
            .slice(0, 1);
        },
        validator: (caveat) => validateAccounts(caveat.value),
        merger: (left, right) => {
          const value = Array.from(new Set([...left, ...right]));
          return [value, value.filter((account) => !left.includes(account))];
        },
      },
    },
    permissionSpecifications: {
      eth_accounts: {
        permissionType: PermissionType.RestrictedMethod,
        targetName: 'eth_accounts',
        allowedCaveats: [RESTRICT_RETURNED_ACCOUNTS],
        factory: (permissionOptions, requestData) => {
          // Granted directly (not through a request): the caveat is supplied,
          // and the validator below requires it.
          if (requestData === undefined) {
            return constructPermission({ ...permissionOptions });
          }
          if (!requestData.approvedAccounts) {
            throw new Error(
              'eth_accounts error: No approved accounts specified.',
            );
          }
          return constructPermission({
            ...permissionOptions,
            caveats: [
              {
                type: RESTRICT_RETURNED_ACCOUNTS,
                value: requestData.approvedAccounts,
              },
            ],
          });
        },
        // Most recently selected first.
        methodImplementation: async () => {
          const accounts = await getAllAccounts();
          const identities = getIdentities();
          return [...accounts].sort((first, second) => {
            if (!identities[first]) {
              throw new Error(`Missing identity for address ${first}`);
            } else if (!identities[second]) {
              throw new Error(`Missing identity for address ${second}`);
            } else if (
              identities[first].lastSelected === identities[second].lastSelected
            ) {
              return 0;
            } else if (identities[first].lastSelected === undefined) {
              return 1;
            } else if (identities[second].lastSelected === undefined) {
              return -1;
            }
            return (
              identities[second].lastSelected - identities[first].lastSelected
            );
          });
        },
        validator: (permission) => {
          const { caveats } = permission;
          if (
            !caveats ||
            caveats.length !== 1 ||
            caveats[0].type !== RESTRICT_RETURNED_ACCOUNTS
          ) {
            throw new Error(
              `eth_accounts error: Invalid caveats. There must be a single caveat of type "${RESTRICT_RETURNED_ACCOUNTS}".`,
            );
          }
        },
      },
    },
  });

  return {
    controller,
    store: {
      getState: () => controller.state,
      subscribe: (listener) =>
        messenger.subscribe('PermissionController:stateChange', (nextState) =>
          listener(nextState),
        ),
    },
  };
}
