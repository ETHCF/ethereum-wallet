import BN from 'bn.js';

export function gasPriceForTransaction(params = {}, receipt = {}) {
  return (
    receipt.effectiveGasPrice || params.maxFeePerGas || params.gasPrice || '0x0'
  );
}

export function isFeeMarketTransaction(params = {}) {
  return (
    params.maxFeePerGas !== undefined ||
    params.maxPriorityFeePerGas !== undefined ||
    [2, 4].includes(Number(params.type))
  );
}

export function bumpFee(hex) {
  const value = new BN(hex.replace(/^0x/u, ''), 16);
  // Round up; zero also needs a nonzero bump for replacement transactions.
  return `0x${BN.max(value.muln(11).addn(9).divn(10), value.addn(1)).toString(16)}`;
}

export function replacementFees(params, customFee) {
  if (!isFeeMarketTransaction(params)) {
    return { gasPrice: customFee || bumpFee(params.gasPrice) };
  }
  const maxPriorityFeePerGas = bumpFee(params.maxPriorityFeePerGas);
  const minimum = bumpFee(params.maxFeePerGas);
  const maxFeePerGas = customFee || minimum;
  if (
    new BN(maxFeePerGas.slice(2), 16).lt(new BN(minimum.slice(2), 16)) ||
    new BN(maxFeePerGas.slice(2), 16).lt(
      new BN(maxPriorityFeePerGas.slice(2), 16),
    )
  ) {
    throw new Error(
      'Replacement maximum fee must cover the increased fee cap and priority fee.',
    );
  }
  return { maxFeePerGas, maxPriorityFeePerGas };
}

export function editedGasParams(
  params = {},
  { gasLimit, gasPrice, maxFeePerGas, maxPriorityFeePerGas },
) {
  if (isFeeMarketTransaction(params)) {
    return {
      ...params,
      gas: gasLimit || params.gas,
      maxFeePerGas: maxFeePerGas || gasPrice || params.maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas || params.maxPriorityFeePerGas,
    };
  }
  return {
    ...params,
    gas: gasLimit || params.gas,
    gasPrice: gasPrice || params.gasPrice,
  };
}
