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

/**
 * Reads a token's symbol and decimals from its contract, through the wallet's
 * provider.
 *
 * @param {string} tokenAddress - The token contract address.
 * @returns {Promise<{symbol: (string|undefined), decimals: (string|undefined)}>}
 * The details; each is undefined if it could not be read, so callers can
 * tell an unknown token from one with 0 decimals.
 */
export async function fetchTokenDetails(tokenAddress) {
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

  return { symbol: symbol || undefined, decimals: decimals || undefined };
}

export async function fetchSymbolAndDecimals(tokenAddress) {
  const { symbol, decimals } = await fetchTokenDetails(tokenAddress);
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

// Shifting the decimal point is exact, where dividing by Math.pow(10, n)
// loses precision past 10^22 and rounds results to 20 decimal places.
export function calcTokenAmount(value, decimals) {
  return new BigNumber(String(value)).shiftedBy(-Number(decimals || 0));
}

export function calcTokenValue(value, decimals) {
  return new BigNumber(String(value)).shiftedBy(Number(decimals || 0));
}

/**
 * Resolves the symbol and decimals to show a token's amounts with: the
 * tracked token's, else those read from the contract.
 *
 * @param {object} options - Options.
 * @param {object} [options.trackedToken] - The user's tracked token, if any.
 * @param {object} [options.fetched] - The result of fetchTokenDetails.
 * @returns {{symbol: (string|undefined), decimals: number, known: boolean}}
 * The details. A token whose decimals are unknown has `known` false and 0
 * decimals, so its amounts are in raw units.
 */
export function resolveTokenDetails({ trackedToken, fetched } = {}) {
  for (const source of [trackedToken, fetched]) {
    const decimals = Number(source?.decimals);
    if (
      source &&
      source.decimals !== undefined &&
      source.decimals !== null &&
      source.decimals !== '' &&
      Number.isInteger(decimals) &&
      decimals >= 0
    ) {
      return { symbol: source.symbol || undefined, decimals, known: true };
    }
  }
  return { symbol: undefined, decimals: 0, known: false };
}

export function getTokenValue(tokenParams = []) {
  const valueData = tokenParams.find((param) => param.name === '_value');
  return valueData && valueData.value;
}

export function getTokenToAddress(tokenParams = []) {
  const toAddressData = tokenParams.find((param) => param.name === '_to');
  return toAddressData ? toAddressData.value : tokenParams[0].value;
}
