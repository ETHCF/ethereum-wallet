export const MAINNET = 'mainnet'
export const LINEA_MAINNET = 'linea-mainnet'
export const ARBITRUM = 'arbitrum'
export const AVALANCHE = 'avalanche'
export const BSC = 'bsc'
export const OPTIMISM = 'optimism'
export const POLYGON = 'polygon'
export const ZKSYNC_ERA = 'zksync-era'
export const SEI = 'sei'
export const MONAD = 'monad'
export const HYPEREVM = 'hyperevm'
export const BASE = 'base'
export const MEGAETH = 'megaeth'
export const TEMPO = 'tempo'
export const ARC = 'arc'
export const ROBINHOOD_CHAIN = 'robinhood-chain'
export const XDC = 'xdc'
export const SEPOLIA = 'sepolia'
export const LINEA_SEPOLIA = 'linea-sepolia'
export const MEGAETH_TESTNET = 'megaeth-testnet'
export const MONAD_TESTNET = 'monad-testnet'
export const LOCALHOST = 'localhost'

export const MAINNET_NETWORK_ID = '1'
export const MAINNET_CHAIN_ID = '0x1'
export const MAINNET_DISPLAY_NAME = 'Ethereum Mainnet'

/**
 * The networks available out of the box: Ethereum and the EVM networks the
 * upstream wallet features, plus current testnets. Each uses a public RPC
 * endpoint that needs no API key. A network's ID (net_version) is its chain ID
 * in decimal for all of these.
 */
export const BUILT_IN_NETWORKS = {
  [MAINNET]: {
    chainId: MAINNET_CHAIN_ID, name: MAINNET_DISPLAY_NAME, ticker: 'ETH', color: '#29b6af',
    rpcUrl: 'https://ethereum-rpc.publicnode.com', blockExplorerUrl: 'https://etherscan.io',
    // Tried in order when the primary cannot be reached.
    fallbackRpcUrls: ['https://eth.drpc.org', 'https://1rpc.io/eth', 'https://eth-mainnet.public.blastapi.io'],
  },
  [LINEA_MAINNET]: {
    chainId: '0xe708', name: 'Linea', ticker: 'ETH', color: '#121212',
    rpcUrl: 'https://rpc.linea.build', blockExplorerUrl: 'https://lineascan.build',
  },
  [ARBITRUM]: {
    chainId: '0xa4b1', name: 'Arbitrum', ticker: 'ETH', color: '#28a0f0',
    rpcUrl: 'https://arb1.arbitrum.io/rpc', blockExplorerUrl: 'https://arbiscan.io',
  },
  [AVALANCHE]: {
    chainId: '0xa86a', name: 'Avalanche', ticker: 'AVAX', color: '#e84142',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', blockExplorerUrl: 'https://snowtrace.io',
  },
  [BSC]: {
    chainId: '0x38', name: 'BNB Chain', ticker: 'BNB', color: '#f0b90b',
    rpcUrl: 'https://bsc-dataseed.bnbchain.org', blockExplorerUrl: 'https://bscscan.com',
  },
  [OPTIMISM]: {
    chainId: '0xa', name: 'OP', ticker: 'ETH', color: '#ff0420',
    rpcUrl: 'https://mainnet.optimism.io', blockExplorerUrl: 'https://optimistic.etherscan.io',
  },
  [POLYGON]: {
    chainId: '0x89', name: 'Polygon', ticker: 'POL', color: '#8247e5',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com', blockExplorerUrl: 'https://polygonscan.com',
  },
  [ZKSYNC_ERA]: {
    chainId: '0x144', name: 'zkSync Era', ticker: 'ETH', color: '#4e529a',
    rpcUrl: 'https://mainnet.era.zksync.io', blockExplorerUrl: 'https://explorer.zksync.io',
  },
  [SEI]: {
    chainId: '0x531', name: 'Sei', ticker: 'SEI', color: '#9e1f19',
    rpcUrl: 'https://evm-rpc.sei-apis.com', blockExplorerUrl: 'https://seiscan.io',
  },
  [MONAD]: {
    chainId: '0x8f', name: 'Monad', ticker: 'MON', color: '#836ef9',
    rpcUrl: 'https://rpc.monad.xyz', blockExplorerUrl: 'https://monadscan.com',
  },
  [HYPEREVM]: {
    chainId: '0x3e7', name: 'HyperEVM', ticker: 'HYPE', color: '#50d2c1',
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm', blockExplorerUrl: 'https://hyperevmscan.io',
  },
  [BASE]: {
    chainId: '0x2105', name: 'Base', ticker: 'ETH', color: '#0052ff',
    rpcUrl: 'https://mainnet.base.org', blockExplorerUrl: 'https://basescan.org',
  },
  [MEGAETH]: {
    chainId: '0x10e6', name: 'MegaETH', ticker: 'ETH', color: '#19191a',
    rpcUrl: 'https://mainnet.megaeth.com/rpc', blockExplorerUrl: 'https://megaeth.blockscout.com',
  },
  [TEMPO]: {
    chainId: '0x1079', name: 'Tempo', ticker: 'USD', color: '#1c1c1c',
    rpcUrl: 'https://rpc.tempo.xyz', blockExplorerUrl: 'https://explore.tempo.xyz',
  },
  [ARC]: {
    chainId: '0x13b2', name: 'Arc', ticker: 'USDC', color: '#2775ca',
    rpcUrl: 'https://arc-rpc.publicnode.com', blockExplorerUrl: 'https://explorer.arc.io',
  },
  [ROBINHOOD_CHAIN]: {
    chainId: '0x1237', name: 'Robinhood Chain', ticker: 'ETH', color: '#ccff00',
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com', blockExplorerUrl: 'https://robin.etherscan.io',
  },
  [XDC]: {
    chainId: '0x32', name: 'XDC Network', ticker: 'XDC', color: '#2a3b8f',
    rpcUrl: 'https://rpc.xinfin.network', blockExplorerUrl: 'https://xdcscan.com',
  },
  [SEPOLIA]: {
    chainId: '0xaa36a7', name: 'Sepolia', ticker: 'SepoliaETH', color: '#cfb5f0', testnet: true,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', blockExplorerUrl: 'https://sepolia.etherscan.io',
  },
  [LINEA_SEPOLIA]: {
    chainId: '0xe705', name: 'Linea Sepolia', ticker: 'LineaETH', color: '#61dfff', testnet: true,
    rpcUrl: 'https://rpc.sepolia.linea.build', blockExplorerUrl: 'https://sepolia.lineascan.build',
  },
  [MEGAETH_TESTNET]: {
    chainId: '0x18c7', name: 'MegaETH Testnet', ticker: 'MegaETH', color: '#9e9e9e', testnet: true,
    rpcUrl: 'https://carrot.megaeth.com/rpc', blockExplorerUrl: 'https://megaeth-testnet-v2.blockscout.com',
  },
  [MONAD_TESTNET]: {
    chainId: '0x279f', name: 'Monad Testnet', ticker: 'MON', color: '#b9aefc', testnet: true,
    rpcUrl: 'https://testnet-rpc.monad.xyz', blockExplorerUrl: 'https://testnet.monadscan.com',
  },
}

for (const network of Object.values(BUILT_IN_NETWORKS)) {
  network.networkId = String(parseInt(network.chainId, 16))
}

export const BUILT_IN_NETWORK_TYPES = Object.keys(BUILT_IN_NETWORKS)

// Testnets that have shut down. Wallets that used one are moved to Sepolia.
export const DEPRECATED_NETWORK_TYPES = ['ropsten', 'rinkeby', 'kovan', 'goerli']

export const NETWORK_TO_NAME_MAP = Object.fromEntries(
  BUILT_IN_NETWORK_TYPES.flatMap((type) => {
    const { name, networkId, chainId } = BUILT_IN_NETWORKS[type]
    return [[type, name], [networkId, name], [chainId, name]]
  }),
)

/**
 * @param {string} networkId - A network ID (net_version).
 * @returns {Object|undefined} The built-in network with that ID, if any.
 */
export function getBuiltInNetworkByNetworkId (networkId) {
  return Object.values(BUILT_IN_NETWORKS).find((network) => network.networkId === String(networkId))
}
