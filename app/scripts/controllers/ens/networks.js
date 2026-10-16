// The ENS registry has the same address on every network ENS is deployed to.
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

/**
 * The ENS registry by network ID: Ethereum Mainnet and Sepolia.
 */
export const ENS_REGISTRIES = Object.freeze({
  1: ENS_REGISTRY,
  11155111: ENS_REGISTRY,
});

/**
 * Whether ENS is deployed on a network.
 *
 * @param {string} network - A network ID, such as '1'
 * @returns {boolean} Whether names can be resolved on it
 */
export function getNetworkEnsSupport(network) {
  return Object.hasOwn(ENS_REGISTRIES, String(network));
}
