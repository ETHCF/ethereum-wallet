import { BUILT_IN_NETWORKS } from '../../../../../app/scripts/controllers/network/enums';

const defaultNetworksData = [
  ...Object.entries(BUILT_IN_NETWORKS).map(([providerType, network]) => ({
    label: network.name,
    iconColor: network.color,
    providerType,
    rpcUrl: network.rpcUrl,
    chainId: network.networkId,
    ticker: network.ticker,
    blockExplorerUrl: network.blockExplorerUrl,
  })),
  // Localhost 8545 exists only in test builds.
  ...(process.env.IN_TEST === 'true'
    ? [
        {
          labelKey: 'localhost',
          iconColor: 'white',
          border: '1px solid #6A737D',
          providerType: 'localhost',
          rpcUrl: 'http://localhost:8545/',
          chainId: '0x539',
        },
      ]
    : []),
];

export { defaultNetworksData };
