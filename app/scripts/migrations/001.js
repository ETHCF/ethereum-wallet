// next version number
/*

Moves wallets connected to a shut-down testnet (Ropsten, Rinkeby, Kovan or
Goerli) to Sepolia, since those networks are no longer built in.

*/

import { cloneDeep } from 'lodash';

import moveProviderOffNetworks from './move-provider';
import {
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
  return moveProviderOffNetworks(state, DEPRECATED_NETWORK_TYPES, SEPOLIA);
}
