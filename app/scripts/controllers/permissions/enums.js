export const WALLET_PREFIX = 'wallet_';

export const HISTORY_STORE_KEY = 'permissionsHistory';

export const METADATA_STORE_KEY = 'domainMetadata';

export const METADATA_CACHE_MAX_SIZE = 100;

export const CAVEAT_TYPES = {
  // The accounts a site may see; it sees only the primary one of them.
  restrictReturnedAccounts: 'restrictReturnedAccounts',
};

export const NOTIFICATION_NAMES = {
  accountsChanged: 'metamask_accountsChanged',
  chainChanged: 'metamask_chainChanged',
};

// Methods a site may call without a permission. Any other method is refused
// with "method not found" (-32601) before it reaches the RPC node.
//
// The read-only methods are plain node calls: they have no side effects and
// carry nothing about the user. The signing and sending methods are answered
// by the wallet itself, which asks the user and checks the site's accounts.
// eth_coinbase is answered by the wallet with the site's permitted account,
// or null, so it reveals no more than eth_accounts.
//
// Not listed: the proof-of-work methods (eth_getWork, eth_submitWork,
// eth_submitHashrate, eth_hashrate, eth_mining) and eth_protocolVersion,
// which no current node serves, and eth_signTypedData_v1, which the wallet
// does not handle (eth_signTypedData is version 1).
export const SAFE_METHODS = [
  'web3_sha3',
  'web3_clientVersion',
  'net_listening',
  'net_peerCount',
  'net_version',
  'eth_blobBaseFee',
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_coinbase',
  'eth_createAccessList',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockReceipts',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_getLogs',
  'eth_getProof',
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
  'eth_newBlockFilter',
  'eth_newFilter',
  'eth_newPendingTransactionFilter',
  'eth_sendRawTransaction',
  'eth_sendTransaction',
  'eth_simulateV1',
  'personal_sign',
  'personal_ecRecover',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_syncing',
  'eth_uninstallFilter',
  'ecf_wallet_watchAsset',
  'wallet_watchAsset',
  'eth_getEncryptionPublicKey',
  'eth_decrypt',
];
