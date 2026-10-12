export const MAINNET = 'mainnet';
export const ARBITRUM = 'arbitrum';
export const OPTIMISM = 'optimism';
export const POLYGON = 'polygon';
export const BASE = 'base';
export const ROBINHOOD_CHAIN = 'robinhood-chain';
export const SEPOLIA = 'sepolia';
export const LOCALHOST = 'localhost';

// The Localhost 8545 network exists only in test builds, as upstream's does,
// and like every network it is tied to one chain: the test chain's.
export const LOCALHOST_CHAIN_ID = '0x539';
export const LOCALHOST_RPC_URL = 'http://localhost:8545';

export const MAINNET_NETWORK_ID = '1';
export const MAINNET_CHAIN_ID = '0x1';
export const MAINNET_DISPLAY_NAME = 'Ethereum Mainnet';

/**
 * The networks available out of the box: Ethereum and the major EVM networks,
 * plus current testnets. Each uses a public RPC endpoint that needs no API key.
 * A network's ID (net_version) is its chain ID in decimal for all of these.
 */
export const BUILT_IN_NETWORKS = {
  [MAINNET]: {
    chainId: MAINNET_CHAIN_ID,
    name: MAINNET_DISPLAY_NAME,
    ticker: 'ETH',
    color: '#29b6af',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    blockExplorerUrl: 'https://etherscan.io',
    // Tried in order when the primary cannot be reached.
    fallbackRpcUrls: [
      'https://eth.drpc.org',
      'https://1rpc.io/eth',
      'https://eth-mainnet.public.blastapi.io',
    ],
  },
  [ARBITRUM]: {
    chainId: '0xa4b1',
    name: 'Arbitrum',
    ticker: 'ETH',
    color: '#28a0f0',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorerUrl: 'https://arbiscan.io',
  },
  [OPTIMISM]: {
    chainId: '0xa',
    name: 'OP',
    ticker: 'ETH',
    color: '#ff0420',
    rpcUrl: 'https://mainnet.optimism.io',
    blockExplorerUrl: 'https://optimistic.etherscan.io',
  },
  [POLYGON]: {
    chainId: '0x89',
    name: 'Polygon',
    ticker: 'POL',
    color: '#8247e5',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    blockExplorerUrl: 'https://polygonscan.com',
  },
  [BASE]: {
    chainId: '0x2105',
    name: 'Base',
    ticker: 'ETH',
    color: '#0052ff',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorerUrl: 'https://basescan.org',
  },
  [ROBINHOOD_CHAIN]: {
    chainId: '0x1237',
    name: 'Robinhood Chain',
    ticker: 'ETH',
    color: '#ccff00',
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    blockExplorerUrl: 'https://robin.etherscan.io',
  },
  [SEPOLIA]: {
    chainId: '0xaa36a7',
    name: 'Sepolia',
    ticker: 'SepoliaETH',
    color: '#cfb5f0',
    testnet: true,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
  },
};

for (const network of Object.values(BUILT_IN_NETWORKS)) {
  network.networkId = String(parseInt(network.chainId, 16));
}

export const BUILT_IN_NETWORK_TYPES = Object.keys(BUILT_IN_NETWORKS);

// Testnets that have shut down. Wallets that used one are moved to Sepolia.
export const DEPRECATED_NETWORK_TYPES = [
  'ropsten',
  'rinkeby',
  'kovan',
  'goerli',
];

// Networks that were built in once and are not any more. A wallet left on one
// has nothing to resolve its type against, so it is moved to mainnet. These are
// not deprecated chains, they are simply no longer carried here.
export const REMOVED_NETWORK_TYPES = [
  'linea-mainnet',
  'avalanche',
  'bsc',
  'zksync-era',
  'sei',
  'monad',
  'hyperevm',
  'megaeth',
  'tempo',
  'arc',
  'xdc',
  'linea-sepolia',
  'megaeth-testnet',
  'monad-testnet',
];

/**
 * Finds a built-in network by its network ID.
 *
 * @param {string} networkId - A network ID (net_version).
 * @returns {object | undefined} The built-in network with that ID, if any.
 */
export function getBuiltInNetworkByNetworkId(networkId) {
  return Object.values(BUILT_IN_NETWORKS).find(
    (network) => network.networkId === String(networkId),
  );
}
