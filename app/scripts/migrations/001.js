// next version number
/*

Moves wallets connected to a shut-down testnet (Ropsten, Rinkeby, Kovan or
Goerli) to Sepolia, since those networks are no longer built in.

*/

import { cloneDeep } from 'lodash';

import {
  BUILT_IN_NETWORKS,
  DEPRECATED_NETWORK_TYPES,
  SEPOLIA,
} from '../controllers/network/enums';

const version = 1;

export default {
  version,

  async migrate(originalVersionedData) {
    const versionedData = cloneDeep(originalVersionedData);
    versionedData.meta.version = version;
    const state = versionedData.data;
    const newState = transformState(state);
    versionedData.data = newState;
    return versionedData;
  },
};

function transformState(state) {
  const provider = state.NetworkController?.provider;
  if (provider && DEPRECATED_NETWORK_TYPES.includes(provider.type)) {
    state.NetworkController.provider = {
      type: SEPOLIA,
      rpcTarget: '',
      ticker: BUILT_IN_NETWORKS[SEPOLIA].ticker,
      nickname: '',
    };
  }
  return state;
}
