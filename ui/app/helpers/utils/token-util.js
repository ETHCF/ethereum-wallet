import log from 'loglevel'
import pify from 'pify'
import { BigNumber } from 'bignumber.js'
import contractMap from '@metamask/contract-metadata'
import { callContract } from '../../../../app/scripts/lib/contract-call'

const casedContractMap = Object.keys(contractMap).reduce((acc, base) => {
  return {
    ...acc,
    [base.toLowerCase()]: contractMap[base],
  }
}, {})

const DEFAULT_SYMBOL = ''
const DEFAULT_DECIMALS = '0'

async function getSymbolFromContract (tokenAddress) {
  try {
    const [symbol] = await callContract(pify(global.ethQuery), tokenAddress, 'symbol()', ['string'])
    return symbol
  } catch (error) {
    log.warn(`symbol() call for token at address ${tokenAddress} resulted in error:`, error)
    return undefined
  }
}

async function getDecimalsFromContract (tokenAddress) {
  try {
    const [decimals] = await callContract(pify(global.ethQuery), tokenAddress, 'decimals()', ['uint8'])
    return decimals.toString()
  } catch (error) {
    log.warn(`decimals() call for token at address ${tokenAddress} resulted in error:`, error)
    return undefined
  }
}

/**
 * @param {string} tokenAddress - An ERC-20 token contract
 * @returns {Object} Reads the token's balances, as `{ balance }` with the
 * balance as a bigint
 */
export function getTokenContract (tokenAddress) {
  return {
    balanceOf: async (owner) => {
      const [balance] = await callContract(pify(global.ethQuery), tokenAddress, 'balanceOf(address)', ['uint256'], [owner])
      return { balance }
    },
  }
}

function getContractMetadata (tokenAddress) {
  return tokenAddress && casedContractMap[tokenAddress.toLowerCase()]
}

async function getSymbol (tokenAddress) {
  let symbol = await getSymbolFromContract(tokenAddress)

  if (!symbol) {
    const contractMetadataInfo = getContractMetadata(tokenAddress)

    if (contractMetadataInfo) {
      symbol = contractMetadataInfo.symbol
    }
  }

  return symbol
}

async function getDecimals (tokenAddress) {
  let decimals = await getDecimalsFromContract(tokenAddress)

  if (!decimals || decimals === '0') {
    const contractMetadataInfo = getContractMetadata(tokenAddress)

    if (contractMetadataInfo) {
      decimals = contractMetadataInfo.decimals
    }
  }

  return decimals
}

export async function fetchSymbolAndDecimals (tokenAddress) {
  let symbol, decimals

  try {
    symbol = await getSymbol(tokenAddress)
    decimals = await getDecimals(tokenAddress)
  } catch (error) {
    log.warn(`symbol() and decimal() calls for token at address ${tokenAddress} resulted in error:`, error)
  }

  return {
    symbol: symbol || DEFAULT_SYMBOL,
    decimals: decimals || DEFAULT_DECIMALS,
  }
}

export async function getSymbolAndDecimals (tokenAddress, existingTokens = []) {
  const existingToken = existingTokens.find(({ address }) => tokenAddress === address)

  if (existingToken) {
    return {
      symbol: existingToken.symbol,
      decimals: existingToken.decimals,
    }
  }

  let symbol, decimals

  try {
    symbol = await getSymbol(tokenAddress)
    decimals = await getDecimals(tokenAddress)
  } catch (error) {
    log.warn(`symbol() and decimal() calls for token at address ${tokenAddress} resulted in error:`, error)
  }

  return {
    symbol: symbol || DEFAULT_SYMBOL,
    decimals: decimals || DEFAULT_DECIMALS,
  }
}

export function tokenInfoGetter () {
  const tokens = {}

  return async (address) => {
    if (tokens[address]) {
      return tokens[address]
    }

    tokens[address] = await getSymbolAndDecimals(address)

    return tokens[address]
  }
}

export function calcTokenAmount (value, decimals) {
  const multiplier = Math.pow(10, Number(decimals || 0))
  return new BigNumber(String(value)).div(multiplier)
}

export function calcTokenValue (value, decimals) {
  const multiplier = Math.pow(10, Number(decimals || 0))
  return new BigNumber(String(value)).times(multiplier)
}

export function getTokenValue (tokenParams = []) {
  const valueData = tokenParams.find((param) => param.name === '_value')
  return valueData && valueData.value
}

export function getTokenToAddress (tokenParams = []) {
  const toAddressData = tokenParams.find((param) => param.name === '_to')
  return toAddressData ? toAddressData.value : tokenParams[0].value
}
