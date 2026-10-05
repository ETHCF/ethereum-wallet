import {
  BUILT_IN_NETWORKS,
  LOCALHOST,
} from '../../../../app/scripts/controllers/network/enums';

/**
 * Gets the name to show for a network.
 *
 * @param {object} provider - The provider config ({ type, nickname, rpcTarget }).
 * @param {Function} t - The i18n function.
 * @returns {string} The name to show for the network.
 */
export function getNetworkDisplayName(provider, t) {
  const builtIn = BUILT_IN_NETWORKS[provider?.type];
  if (builtIn) {
    return builtIn.name;
  }
  if (provider?.type === LOCALHOST) {
    return t('localhost');
  }
  return provider?.nickname || t('unknownNetwork');
}

/**
 * Gets the message shown while connecting to a network.
 *
 * @param {object} provider - The provider config ({ type, nickname, rpcTarget }).
 * @param {string} providerId - The network identifier (from
 * getNetworkIdentifier), shown for networks that are not built in.
 * @param {Function} t - The i18n function.
 * @returns {string} The message shown while connecting to the network.
 */
export function getConnectingLabel(provider, providerId, t) {
  if (BUILT_IN_NETWORKS[provider?.type]) {
    return t('connectingTo', [BUILT_IN_NETWORKS[provider.type].name]);
  }
  if (provider?.type === LOCALHOST) {
    return t('connectingToLocalhost');
  }
  return t('connectingTo', [providerId]);
}
