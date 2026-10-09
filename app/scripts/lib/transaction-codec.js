import { decodeTypedTransaction } from './transaction-codec-implementation';

// Hardware SDKs use their own compatible EthereumJS version (see hardware-transport.js).
export { createTypedTransaction as createTransaction } from './transaction-codec-implementation';

export function decodeTransaction(hex, chainId) {
  const bytes = Buffer.from(hex.replace(/^0x/u, ''), 'hex');
  return decodeTypedTransaction(bytes, chainId);
}

export function transactionData(tx) {
  return {
    ...tx.toJSON(),
    type: `0x${tx.type.toString(16)}`,
    chainId: `0x${tx.common.chainId().toString(16)}`,
  };
}
