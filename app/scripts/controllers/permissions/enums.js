
export const WALLET_PREFIX = 'wallet_'

export const HISTORY_STORE_KEY = 'permissionsHistory'

export const LOG_STORE_KEY = 'permissionsLog'

export const METADATA_STORE_KEY = 'domainMetadata'

export const METADATA_CACHE_MAX_SIZE = 100

export const CAVEAT_TYPES = {
  // The accounts a site may see; it sees only the primary one of them.
  restrictReturnedAccounts: 'restrictReturnedAccounts',
}

export const NOTIFICATION_NAMES = {
  accountsChanged: 'metamask_accountsChanged',
  chainChanged: 'metamask_chainChanged',
}

export const LOG_IGNORE_METHODS = [
  'metamask_sendDomainMetadata',
  'metamask_getProviderState',
]

export const LOG_METHOD_TYPES = {
  restricted: 'restricted',
  internal: 'internal',
}

export const LOG_LIMIT = 100

export const SAFE_METHODS = [
  'web3_sha3',
  'web3_clientVersion',
  'net_listening',
  'net_peerCount',
  'net_version',
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_coinbase',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getUncleByBlockHashAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'eth_getUncleCountByBlockHash',
  'eth_getUncleCountByBlockNumber',
  'eth_getWork',
  'eth_hashrate',
  'eth_mining',
  'eth_newBlockFilter',
  'eth_newFilter',
  'eth_newPendingTransactionFilter',
  'eth_protocolVersion',
  'eth_sendRawTransaction',
  'eth_sendTransaction',
  'personal_sign',
  'personal_ecRecover',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_submitHashrate',
  'eth_submitWork',
  'eth_syncing',
  'eth_uninstallFilter',
  'ecf_wallet_watchAsset',
  'wallet_watchAsset',
  'eth_getEncryptionPublicKey',
  'eth_decrypt',
]
