/* global globalThis */
import Transaction from 'ethereumjs-tx'

// Loaded before the background bundle. Keep modern EthereumJS dependencies out
// of Browserify; hardware SDKs use their own compatible EthereumJS version.
export function createTransaction (params, chainId) {
  if (!Number(params.type)) {
    return new Transaction({ ...params, chainId })
  }
  return globalThis.ecfWalletTransactionCodec.createTypedTransaction(params, chainId)
}

export function decodeTransaction (hex, chainId) {
  const bytes = Buffer.from(hex.replace(/^0x/u, ''), 'hex')
  return bytes[0] >= 0xc0
    ? new Transaction(bytes)
    : globalThis.ecfWalletTransactionCodec.decodeTypedTransaction(bytes, chainId)
}

export function transactionData (tx) {
  return typeof tx.getChainId === 'function'
    ? { ...tx.toJSON(true), chainId: tx.getChainId() }
    : { ...tx.toJSON(), type: `0x${tx.type.toString(16)}`, chainId: `0x${tx.common.chainId().toString(16)}` }
}
