import { AddressBookController } from '@metamask/address-book-controller';
import {
  NftController,
  NftDetectionController,
} from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';
import {
  PermissionController,
  PermissionType,
  constructPermission,
} from '@metamask/permission-controller';

import { CAVEAT_TYPES } from '../controllers/permissions/enums';

/**
 * An ObservableStore-like view of a controller's state, for
 * ComposableObservableStore.
 *
 * @param {object} controller - The controller
 * @param {Messenger} messenger - The controller's messenger
 * @param {string} namespace - The controller's messenger namespace
 * @returns {object} The store view
 */
function stateStore(controller, messenger, namespace) {
  return {
    getState: () => controller.state,
    subscribe: (listener) =>
      messenger.subscribe(`${namespace}:stateChange`, (nextState) =>
        listener(nextState),
      ),
  };
}

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
    store: stateStore(controller, messenger, 'AddressBookController'),
  };
}

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
      [CAVEAT_TYPES.restrictReturnedAccounts]: {
        type: CAVEAT_TYPES.restrictReturnedAccounts,
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
        allowedCaveats: [CAVEAT_TYPES.restrictReturnedAccounts],
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
                type: CAVEAT_TYPES.restrictReturnedAccounts,
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
            caveats[0].type !== CAVEAT_TYPES.restrictReturnedAccounts
          ) {
            throw new Error(
              `eth_accounts error: Invalid caveats. There must be a single caveat of type "${CAVEAT_TYPES.restrictReturnedAccounts}".`,
            );
          }
        },
      },
    },
  });

  return {
    controller,
    store: stateStore(controller, messenger, 'PermissionController'),
  };
}

// The wallet has one network at a time, so its NFT controllers see one
// network client.
const SELECTED_NETWORK_CLIENT_ID = 'selected';

/**
 * Creates upstream's NftController and NftDetectionController, connected to
 * the wallet's own network, account and phishing list.
 *
 * They are used only for detection. NftController's own metadata lookups, which
 * contact each NFT creator's metadata host and the NFT API again, stay off:
 * the wallet downloads images itself, through its image fetcher, when the user
 * allows it.
 *
 * @param {object} options - The options.
 * @param {object} [options.state] - The persisted NftController state.
 * @param {Function} options.getChainId - Returns the selected chain ID.
 * @param {Function} options.getProvider - Returns the selected provider.
 * @param {Function} options.getSelectedAddress - Returns the selected account.
 * @param {Function} options.isPhishing - Whether a URL's host is on the
 * phishing list.
 * @param {boolean} options.useNftDetection - Whether detection starts enabled.
 * @returns {object} The controllers, an ObservableStore-like view of
 * NftController's state, and setUseNftDetection to keep detection in step
 * with the preference.
 */
export function createNftControllers({
  state,
  getChainId,
  getProvider,
  getSelectedAddress,
  isPhishing,
  useNftDetection,
}) {
  const nftMessenger = new Messenger({ namespace: 'NftController' });
  const detectionMessenger = new Messenger({
    namespace: 'NftDetectionController',
  });
  const targets = [nftMessenger, detectionMessenger];
  const shim = (namespace, actions, events = []) => {
    const messenger = new Messenger({ namespace });
    for (const [action, handler] of Object.entries(actions)) {
      messenger.registerActionHandler(`${namespace}:${action}`, handler);
    }
    for (const target of targets) {
      messenger.delegate({
        messenger: target,
        actions: Object.keys(actions).map((action) => `${namespace}:${action}`),
        events: events.map((event) => `${namespace}:${event}`),
      });
    }
    return messenger;
  };

  const sameChain = (chainId) =>
    String(chainId).toLowerCase() === String(getChainId()).toLowerCase();
  shim('NetworkController', {
    getState: () => ({ selectedNetworkClientId: SELECTED_NETWORK_CLIENT_ID }),
    getNetworkClientById: () => ({
      configuration: { chainId: getChainId() },
      provider: getProvider(),
    }),
    findNetworkClientIdByChainId: (chainId) => {
      if (!sameChain(chainId)) {
        throw new Error(`No network client for chain ${chainId}`);
      }
      return SELECTED_NETWORK_CLIENT_ID;
    },
  });

  const account = (address) => ({
    id: address,
    address,
    type: 'eip155:eoa',
    metadata: {},
  });
  shim(
    'AccountsController',
    {
      getSelectedAccount: () => account(getSelectedAddress()),
      getAccount: (id) => account(id),
    },
    ['selectedEvmAccountChange'],
  );

  // Checked against the wallet's own phishing list: nothing is sent anywhere.
  shim('PhishingController', {
    bulkScanUrls: (urls) => ({
      results: Object.fromEntries(
        urls.map((url) => [
          url,
          { recommendedAction: isPhishing(url) ? 'BLOCK' : 'NONE' },
        ]),
      ),
    }),
  });

  shim('ApprovalController', {
    addRequest: () => {
      throw new Error('NFTs cannot be added by request');
    },
  });

  const preferencesState = (enabled) => ({
    useNftDetection: enabled,
    // NftController's own metadata lookups stay off. See above.
    displayNftMedia: false,
    openSeaEnabled: false,
    ipfsGateway: '',
    isIpfsGatewayEnabled: false,
  });
  const preferences = shim('PreferencesController', {}, ['stateChange']);

  const nftController = new NftController({
    messenger: nftMessenger,
    state,
    ipfsGateway: '',
    displayNftMedia: false,
    isIpfsGatewayEnabled: false,
  });
  const nftDetectionController = new NftDetectionController({
    messenger: detectionMessenger,
    disabled: !useNftDetection,
    addNfts: (...args) => nftController.addNfts(...args),
    getNftState: () => nftController.state,
  });

  return {
    nftController,
    nftDetectionController,
    store: stateStore(nftController, nftMessenger, 'NftController'),
    setUseNftDetection: (enabled) =>
      preferences.publish(
        'PreferencesController:stateChange',
        preferencesState(enabled),
        [],
      ),
  };
}
