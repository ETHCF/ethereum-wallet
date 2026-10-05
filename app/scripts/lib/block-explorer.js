import { getBuiltInNetworkByNetworkId } from '../controllers/network/enums';

/**
 * Finds the block explorer for a network, preferring a custom one.
 *
 * @param {string} networkId - The network ID (net_version) of the item.
 * @param {object} [rpcPrefs] - Custom network preferences, which may name an explorer.
 * @returns {string|undefined} The explorer's base URL, without a trailing slash.
 */
export function getBlockExplorerBaseUrl(networkId, rpcPrefs = {}) {
  const url =
    rpcPrefs?.blockExplorerUrl ||
    getBuiltInNetworkByNetworkId(networkId)?.blockExplorerUrl;
  return url ? url.replace(/\/+$/u, '') : undefined;
}

export function getTxExplorerUrl(hash, networkId, rpcPrefs) {
  const base = getBlockExplorerBaseUrl(networkId, rpcPrefs);
  return base ? `${base}/tx/${hash}` : '';
}

export function getAddressExplorerUrl(address, networkId, rpcPrefs) {
  const base = getBlockExplorerBaseUrl(networkId, rpcPrefs);
  return base ? `${base}/address/${address}` : '';
}
