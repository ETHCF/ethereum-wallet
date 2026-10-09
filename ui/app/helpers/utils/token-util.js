import contractMap from '@metamask/contract-metadata';
import { BigNumber } from 'bignumber.js';
import log from 'loglevel';
import pify from 'pify';

import { callContract } from '../../../../app/scripts/lib/contract-call';

const casedContractMap = Object.keys(contractMap).reduce((acc, base) => {
  return {
    ...acc,
    [base.toLowerCase()]: contractMap[base],
  };
}, {});

const DEFAULT_SYMBOL = '';
const DEFAULT_DECIMALS = '0';

/**
 * Calls a no-argument ERC-20 getter (such as `symbol()`) on a token contract.
 *
 * @param {string} tokenAddress - The token contract address.
 * @param {string} signature - The getter's function signature.
 * @param {string} outputType - The ABI type of the getter's return value.
 * @returns {Promise<*>} The returned value, or undefined if the call failed.
 */
async function callTokenGetter(tokenAddress, signature, outputType) {
  try {
    const [value] = await callContract(
      pify(global.ethQuery),
      tokenAddress,
      signature,
      [outputType],
    );
    return value;
  } catch (error) {
    log.warn(
      `${signature} call for token at address ${tokenAddress} resulted in error:`,
      error,
    );
    return undefined;
  }
}

/**
 * Gets a minimal ERC-20 contract reader for a token.
 *
 * @param {string} tokenAddress - An ERC-20 token contract
 * @returns {object} Reads the token's balances, as `{ balance }` with the
 * balance as a bigint
 */
export function getTokenContract(tokenAddress) {
  return {
    balanceOf: async (owner) => {
      const [balance] = await callContract(
        pify(global.ethQuery),
        tokenAddress,
        'balanceOf(address)',
        ['uint256'],
        [owner],
      );
      return { balance };
    },
  };
}

function getContractMetadata(tokenAddress) {
  return tokenAddress && casedContractMap[tokenAddress.toLowerCase()];
}

async function getSymbol(tokenAddress) {
  const symbol = await callTokenGetter(tokenAddress, 'symbol()', 'string');
  return symbol || getContractMetadata(tokenAddress)?.symbol;
}

async function getDecimals(tokenAddress) {
  const decimals = (
    await callTokenGetter(tokenAddress, 'decimals()', 'uint8')
  )?.toString();
  if (decimals && decimals !== '0') {
    return decimals;
  }
  return getContractMetadata(tokenAddress)?.decimals ?? decimals;
}

export async function fetchSymbolAndDecimals(tokenAddress) {
  let symbol, decimals;

  try {
    symbol = await getSymbol(tokenAddress);
    decimals = await getDecimals(tokenAddress);
  } catch (error) {
    log.warn(
      `symbol() and decimal() calls for token at address ${tokenAddress} resulted in error:`,
      error,
    );
  }

  return {
    symbol: symbol || DEFAULT_SYMBOL,
    decimals: decimals || DEFAULT_DECIMALS,
  };
}

export function tokenInfoGetter() {
  const tokens = {};

  return async (address) => {
    if (tokens[address]) {
      return tokens[address];
    }

    tokens[address] = await fetchSymbolAndDecimals(address);

    return tokens[address];
  };
}

export function calcTokenAmount(value, decimals) {
  const multiplier = Math.pow(10, Number(decimals || 0));
  return new BigNumber(String(value)).div(multiplier);
}

export function calcTokenValue(value, decimals) {
  const multiplier = Math.pow(10, Number(decimals || 0));
  return new BigNumber(String(value)).times(multiplier);
}

export function getTokenValue(tokenParams = []) {
  const valueData = tokenParams.find((param) => param.name === '_value');
  return valueData && valueData.value;
}

export function getTokenToAddress(tokenParams = []) {
  const toAddressData = tokenParams.find((param) => param.name === '_to');
  return toAddressData ? toAddressData.value : tokenParams[0].value;
}
