// next version number
/*

Moves wallets connected to a network that is no longer built in (Linea,
Avalanche, BNB Chain, zkSync Era, Sei, Monad, HyperEVM, MegaETH, Tempo, Arc,
XDC and their testnets) to Ethereum mainnet. Nothing resolves their provider
type any more, so the wallet would have no name, ticker or RPC endpoint.

*/

import { cloneDeep } from 'lodash'
import { BUILT_IN_NETWORKS, MAINNET, REMOVED_NETWORK_TYPES } from '../controllers/network/enums'

const version = 3

export default {
  version,

  async migrate (originalVersionedData) {
    const versionedData = cloneDeep(originalVersionedData)
    versionedData.meta.version = version
    const state = versionedData.data
    const newState = transformState(state)
    versionedData.data = newState
    return versionedData
  },
}

function transformState (state) {
  const provider = state.NetworkController?.provider
  if (provider && REMOVED_NETWORK_TYPES.includes(provider.type)) {
    state.NetworkController.provider = {
      type: MAINNET,
      rpcTarget: '',
      ticker: BUILT_IN_NETWORKS[MAINNET].ticker,
      nickname: '',
    }
  }
  return state
}
