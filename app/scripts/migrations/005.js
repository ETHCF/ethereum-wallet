// next version number
/*

Turns the built-in Localhost 8545 network, which now exists only in test
builds, into a custom network. Like every custom network it is tied to a
chain ID, so that a local fork of mainnet cannot get transactions signed for
mainnet without the user choosing that chain. It starts on the usual test
chain's ID, which the user can change in the network's settings.

*/

import { cloneDeep } from 'lodash';

const version = 5;

const LOCALHOST_NETWORK = {
  rpcUrl: 'http://localhost:8545',
  chainId: '0x539',
  ticker: 'ETH',
  nickname: 'Localhost 8545',
  rpcPrefs: {},
};

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
  // Test builds still have the built-in network.
  if (process.env.IN_TEST === 'true' || provider?.type !== 'localhost') {
    return state;
  }
  const preferences =
    state.PreferencesController &&
    typeof state.PreferencesController === 'object'
      ? state.PreferencesController
      : undefined;
  const rpcList = Array.isArray(preferences?.frequentRpcListDetail)
    ? preferences.frequentRpcListDetail
    : [];
  // A custom network the user already set up for this URL keeps its chain.
  let network = rpcList.find(
    (rpc) => rpc?.rpcUrl === LOCALHOST_NETWORK.rpcUrl && rpc.chainId,
  );
  if (!network) {
    network = { ...LOCALHOST_NETWORK };
    if (preferences) {
      preferences.frequentRpcListDetail = [
        ...rpcList.filter((rpc) => rpc?.rpcUrl !== LOCALHOST_NETWORK.rpcUrl),
        network,
      ];
    }
  }
  const { rpcUrl, chainId, ticker, nickname, rpcPrefs } = network;
  state.NetworkController.provider = {
    type: 'rpc',
    rpcTarget: rpcUrl,
    chainId,
    ticker: ticker || 'ETH',
    nickname: nickname || '',
    rpcPrefs: rpcPrefs || {},
  };
  return state;
}
