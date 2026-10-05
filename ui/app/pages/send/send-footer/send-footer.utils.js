import * as ethUtil from '@ethereumjs/util';
import { encode } from '@metamask/abi-utils';

import { TOKEN_TRANSFER_FUNCTION_SIGNATURE } from '../send.constants';

export function addHexPrefixToObjectValues(obj) {
  return Object.keys(obj).reduce((newObj, key) => {
    return { ...newObj, [key]: ethUtil.addHexPrefix(obj[key]) };
  }, {});
}

export function constructTxParams({
  sendToken,
  data,
  to,
  amount,
  from,
  gas,
  gasPrice,
  gasPriceIsCustom,
}) {
  const txParams = {
    data,
    from,
    value: '0',
    gas,
    gasPrice,
  };
  // A gas price the user chose is kept as a legacy transaction's price. Without
  // one, the wallet uses EIP-1559 fees on networks that support them.
  if (gasPriceIsCustom) {
    txParams.type = '0x0';
  }

  if (!sendToken) {
    txParams.value = amount;
    txParams.to = to;
  }

  return addHexPrefixToObjectValues(txParams);
}

export function constructUpdatedTx({
  amount,
  data,
  editingTransactionId,
  from,
  gas,
  gasPrice,
  gasPriceIsCustom,
  sendToken,
  to,
  unapprovedTxs,
}) {
  const unapprovedTx = unapprovedTxs[editingTransactionId];
  const txParamsData = unapprovedTx.txParams.data
    ? unapprovedTx.txParams.data
    : data;
  const { maxFeePerGas, maxPriorityFeePerGas, ...legacyParams } =
    unapprovedTx.txParams;
  const feeMarket =
    maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined;

  let feeParams;
  if (gasPriceIsCustom) {
    // The user's gas price replaces EIP-1559 fees, as a legacy transaction.
    feeParams = { gasPrice, type: legacyParams.accessList ? '0x1' : '0x0' };
  } else if (feeMarket) {
    // Keep the transaction's EIP-1559 fees; the form's price is an estimate.
    feeParams = {};
  } else {
    feeParams = { gasPrice };
  }

  const editingTx = {
    ...unapprovedTx,
    txParams: {
      ...(gasPriceIsCustom ? legacyParams : unapprovedTx.txParams),
      ...addHexPrefixToObjectValues({
        data: txParamsData,
        to,
        from,
        gas,
        value: amount,
        ...feeParams,
      }),
    },
  };

  if (sendToken) {
    Object.assign(
      editingTx.txParams,
      addHexPrefixToObjectValues({
        value: '0',
        to: sendToken.address,
        data:
          TOKEN_TRANSFER_FUNCTION_SIGNATURE +
          Buffer.from(
            encode(['address', 'uint256'], [to, ethUtil.addHexPrefix(amount)]),
          ).toString('hex'),
      }),
    );
  }

  if (typeof editingTx.txParams.data === 'undefined') {
    delete editingTx.txParams.data;
  }

  return editingTx;
}

export function addressIsNew(toAccounts, newAddress) {
  const newAddressNormalized = newAddress.toLowerCase();
  const foundMatching = toAccounts.some(
    ({ address }) => address.toLowerCase() === newAddressNormalized,
  );
  return !foundMatching;
}
