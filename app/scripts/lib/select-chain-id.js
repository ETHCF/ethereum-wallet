import { BUILT_IN_NETWORKS } from '../controllers/network/enums'
import { normalizeChainId } from '../controllers/network/chain-utils'

/**
 * The chain ID to report before the network has answered eth_chainId. A
 * network ID is not a chain ID, so networks without a known or configured
 * chain ID report none rather than a guess that would then change.
 *
 * @param {Object} ecfWalletState - Contains the provider config.
 * @returns {string|undefined} A hex chain ID.
 */
export default function selectChainId (ecfWalletState) {
  const { provider: { type, chainId } } = ecfWalletState
  return BUILT_IN_NETWORKS[type]?.chainId || normalizeChainId(chainId)
}
