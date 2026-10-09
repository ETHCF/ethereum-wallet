import { BUILT_IN_NETWORKS } from '../controllers/network/enums';

/**
 * Moves the wallet's provider to a built-in network if it is on one of the
 * given network types.
 *
 * @param {object} state - The wallet state, modified in place
 * @param {string[]} networkTypes - The provider types to move off
 * @param {string} targetType - The built-in network type to move to
 * @returns {object} The state
 */
export default function moveProviderOffNetworks(
  state,
  networkTypes,
  targetType,
) {
  const provider = state.NetworkController?.provider;
  if (provider && networkTypes.includes(provider.type)) {
    state.NetworkController.provider = {
      type: targetType,
      rpcTarget: '',
      ticker: BUILT_IN_NETWORKS[targetType].ticker,
      nickname: '',
    };
  }
  return state;
}
