
// Loaded before the background bundle. Keep modern EthereumJS dependencies out
// of Browserify; hardware SDKs use their own compatible EthereumJS version.
export function createTransaction (params, chainId) {
  return globalThis.ecfWalletTransactionCodec.createTypedTransaction(params, chainId)
}

export function decodeTransaction (hex, chainId) {
  const bytes = Buffer.from(hex.replace(/^0x/u, ''), 'hex')
  return globalThis.ecfWalletTransactionCodec.decodeTypedTransaction(bytes, chainId)
}

export function transactionData (tx) {
  return { ...tx.toJSON(), type: `0x${tx.type.toString(16)}`, chainId: `0x${tx.common.chainId().toString(16)}` }
}
