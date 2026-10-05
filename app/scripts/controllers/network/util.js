import { NETWORK_TO_NAME_MAP } from './enums';
import { gasPriceForTransaction } from '../../lib/transaction-fees';

export const getNetworkDisplayName = (key) => NETWORK_TO_NAME_MAP[key];

export function formatTxMetaForRpcResult(txMeta) {
  const envelope = {};
  for (const field of [
    'type',
    'chainId',
    'maxFeePerGas',
    'maxPriorityFeePerGas',
    'accessList',
    'authorizationList',
  ]) {
    if (txMeta.txParams[field] !== undefined) {
      envelope[field] = txMeta.txParams[field];
    }
  }
  return {
    ...envelope,
    blockHash: txMeta.txReceipt ? txMeta.txReceipt.blockHash : null,
    blockNumber: txMeta.txReceipt ? txMeta.txReceipt.blockNumber : null,
    from: txMeta.txParams.from,
    gas: txMeta.txParams.gas,
    gasPrice: gasPriceForTransaction(txMeta.txParams, txMeta.txReceipt),
    hash: txMeta.hash,
    input: txMeta.txParams.data || '0x',
    nonce: txMeta.txParams.nonce,
    to: txMeta.txParams.to,
    transactionIndex: txMeta.txReceipt
      ? txMeta.txReceipt.transactionIndex
      : null,
    value: txMeta.txParams.value || '0x0',
    v: txMeta.v,
    r: txMeta.r,
    s: txMeta.s,
  };
}
