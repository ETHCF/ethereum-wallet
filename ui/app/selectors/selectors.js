import { stripHexPrefix, addHexPrefix } from '@ethereumjs/util';
import { createSelector } from 'reselect';

import { getPermissionsRequestCount } from './permissions';
import {
  BUILT_IN_NETWORKS,
  POLYGON,
} from '../../../app/scripts/controllers/network/enums';
import { NETWORK_TYPES } from '../helpers/constants/common';
import { checksumAddress, getAccountByAddress } from '../helpers/utils/util';

export function getNetworkIdentifier(state) {
  const {
    ecfWallet: {
      provider: { type, nickname, rpcTarget },
    },
  } = state;

  return nickname || rpcTarget || type;
}

export function getCurrentKeyring(state) {
  const identity = getSelectedIdentity(state);

  if (!identity) {
    return null;
  }

  const simpleAddress = stripHexPrefix(identity.address).toLowerCase();

  const keyring = state.ecfWallet.keyrings.find((kr) => {
    return (
      kr.accounts.includes(simpleAddress) ||
      kr.accounts.includes(identity.address)
    );
  });

  return keyring;
}

export function getCurrentNetworkId(state) {
  return state.ecfWallet.network;
}

export const getEcfWalletAccounts = createSelector(
  getEcfWalletAccountsRaw,
  getEcfWalletCachedBalances,
  (currentAccounts, cachedBalances) =>
    Object.entries(currentAccounts).reduce(
      (selectedAccounts, [accountID, account]) => {
        if (account.balance === null || account.balance === undefined) {
          return {
            ...selectedAccounts,
            [accountID]: {
              ...account,
              balance: cachedBalances && cachedBalances[accountID],
            },
          };
        }
        return {
          ...selectedAccounts,
          [accountID]: account,
        };
      },
      {},
    ),
);

export function getSelectedAddress(state) {
  return state.ecfWallet.selectedAddress;
}

export function getSelectedIdentity(state) {
  const selectedAddress = getSelectedAddress(state);
  const { identities } = state.ecfWallet;

  return identities[selectedAddress];
}

export function getEcfWalletKeyrings(state) {
  return state.ecfWallet.keyrings;
}

export function getEcfWalletIdentities(state) {
  return state.ecfWallet.identities;
}

export function getEcfWalletAccountsRaw(state) {
  return state.ecfWallet.accounts;
}

export function getEcfWalletCachedBalances(state) {
  const network = getCurrentNetworkId(state);

  return state.ecfWallet.cachedBalances[network];
}

/**
 * Get ordered (by keyrings) accounts with identity and balance
 */
export const getEcfWalletAccountsOrdered = createSelector(
  getEcfWalletKeyrings,
  getEcfWalletIdentities,
  getEcfWalletAccounts,
  (keyrings, identities, accounts) =>
    keyrings
      .reduce((list, keyring) => list.concat(keyring.accounts), [])
      .filter((address) => Boolean(identities[address]))
      .map((address) => ({ ...identities[address], ...accounts[address] })),
);

export function isBalanceCached(state) {
  const selectedAccountBalance =
    state.ecfWallet.accounts[getSelectedAddress(state)].balance;
  const cachedBalance = getSelectedAccountCachedBalance(state);

  return Boolean(!selectedAccountBalance && cachedBalance);
}

export function getSelectedAccountCachedBalance(state) {
  const cachedBalances =
    state.ecfWallet.cachedBalances[state.ecfWallet.network];
  const selectedAddress = getSelectedAddress(state);

  return cachedBalances && cachedBalances[selectedAddress];
}

export function getSelectedAccount(state) {
  const accounts = getEcfWalletAccounts(state);
  const selectedAddress = getSelectedAddress(state);

  return accounts[selectedAddress];
}

export function getTargetAccount(state, targetAddress) {
  const accounts = getEcfWalletAccounts(state);
  return accounts[targetAddress];
}

export function getAssetImages(state) {
  const assetImages = state.ecfWallet.assetImages || {};
  return assetImages;
}

export function getAddressBook(state) {
  const { network } = state.ecfWallet;
  if (!state.ecfWallet.addressBook[network]) {
    return [];
  }
  return Object.values(state.ecfWallet.addressBook[network]);
}

export function getAddressBookEntry(state, address) {
  const addressBook = getAddressBook(state);
  const entry = addressBook.find(
    (contact) => contact.address === checksumAddress(address),
  );
  return entry;
}

export function accountsWithSendEtherInfoSelector(state) {
  const accounts = getEcfWalletAccounts(state);
  const identities = getEcfWalletIdentities(state);

  const accountsWithSendEtherInfo = Object.entries(identities).map(
    ([key, identity]) => {
      return { ...identity, ...accounts[key] };
    },
  );

  return accountsWithSendEtherInfo;
}

export function getAccountsWithLabels(state) {
  return getEcfWalletAccountsOrdered(state).map(
    ({ address, name, balance }) => ({
      address,
      addressLabel: `${name} (...${address.slice(address.length - 4)})`,
      label: name,
      balance,
    }),
  );
}

export function getCurrentAccountWithSendEtherInfo(state) {
  const currentAddress = getSelectedAddress(state);
  const accounts = accountsWithSendEtherInfoSelector(state);

  return getAccountByAddress(accounts, currentAddress);
}

export function getTargetAccountWithSendEtherInfo(state, targetAddress) {
  const accounts = accountsWithSendEtherInfoSelector(state);
  return getAccountByAddress(accounts, targetAddress);
}

export function getCurrentEthBalance(state) {
  return getCurrentAccountWithSendEtherInfo(state).balance;
}

export function getGasIsLoading(state) {
  return state.appState.gasIsLoading;
}

export function getTotalUnapprovedCount(state) {
  const {
    unapprovedPersonalMsgCount = 0,
    unapprovedDecryptMsgCount = 0,
    unapprovedEncryptionPublicKeyMsgCount = 0,
    unapprovedTypedMessagesCount = 0,
  } = state.ecfWallet;

  return (
    unapprovedPersonalMsgCount +
    unapprovedDecryptMsgCount +
    unapprovedEncryptionPublicKeyMsgCount +
    unapprovedTypedMessagesCount +
    getUnapprovedTxCount(state) +
    getPermissionsRequestCount(state) +
    getSuggestedTokenCount(state) +
    getNetworkRequests(state).length
  );
}

/**
 * Gets the pending network requests.
 *
 * @param {object} state - The Redux state.
 * @returns {object[]} Pending requests from sites to add or switch networks, oldest first.
 */
export function getNetworkRequests(state) {
  const { pendingNetworkRequests = {} } = state.ecfWallet;
  return Object.values(pendingNetworkRequests).sort((a, b) => a.time - b.time);
}

function getUnapprovedTxCount(state) {
  const { unapprovedTxs = {} } = state.ecfWallet;
  return Object.keys(unapprovedTxs).length;
}

function getSuggestedTokenCount(state) {
  const { suggestedTokens = {} } = state.ecfWallet;
  return Object.keys(suggestedTokens).length;
}

export function getIsMainnet(state) {
  const networkType = getNetworkIdentifier(state);
  return networkType === NETWORK_TYPES.MAINNET;
}

// Network state is the chain ID for built-in networks and net_version for custom RPCs
const POLYGON_NETWORK_IDS = [BUILT_IN_NETWORKS[POLYGON].chainId, '137'];

/**
 * Returns the logo for the current network's native currency, or undefined to use the default ETH logo
 *
 * @param {object} state - The Redux state.
 * @param {object} state.ecfWallet - The background state.
 * @param {string} state.ecfWallet.network - The current network ID.
 * @param {object} state.ecfWallet.provider - The current provider config.
 * @returns {string|undefined} The logo's path, or undefined.
 */
export function getNativeCurrencyImage({ ecfWallet: { network, provider } }) {
  if (provider?.type === POLYGON || POLYGON_NETWORK_IDS.includes(network)) {
    return './images/polygon.png';
  }
  return undefined;
}

export function getPreferences({ ecfWallet }) {
  return ecfWallet.preferences;
}

export function getDomainMetadata(state) {
  return state.ecfWallet.domainMetadata;
}

export function getRpcPrefsForCurrentProvider(state) {
  const { frequentRpcListDetail, provider } = state.ecfWallet;
  const builtIn = BUILT_IN_NETWORKS[provider?.type];
  if (builtIn) {
    return { blockExplorerUrl: builtIn.blockExplorerUrl };
  }
  const selectRpcInfo = frequentRpcListDetail?.find(
    (rpcInfo) => rpcInfo.rpcUrl === provider?.rpcTarget,
  );
  const { rpcPrefs = {} } = selectRpcInfo || {};
  return rpcPrefs;
}

export function getKnownMethodData(state, data) {
  if (!data) {
    return null;
  }
  const prefixedData = addHexPrefix(data);
  const fourBytePrefix = prefixedData.slice(0, 10);
  const { knownMethodData } = state.ecfWallet;

  return knownMethodData && knownMethodData[fourBytePrefix];
}

export function getOriginOfCurrentTab(state) {
  return state.activeTab.origin;
}
