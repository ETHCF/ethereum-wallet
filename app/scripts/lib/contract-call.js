import { encode, decode } from '@metamask/abi-utils'
import { bytesToHex, hexToBytes } from '@ethereumjs/util'
import { functionSelector } from './abi-method-decoder'

/**
 * @param {string} signature - A function signature with simple argument
 * types, such as 'transfer(address,uint256)'
 * @param {Array} [args] - The arguments, in the signature's order
 * @returns {string} The 0x-prefixed call data
 */
export function encodeCall (signature, args = []) {
  const types = signature.slice(signature.indexOf('(') + 1, -1).split(',').filter(Boolean)
  return `0x${functionSelector(signature)}${bytesToHex(encode(types, args)).slice(2)}`
}

/**
 * Calls a contract's read-only function at the latest block.
 *
 * @param {Object} query - An EthQuery whose methods return promises (see pify)
 * @param {string} to - The contract address
 * @param {string} signature - The function, such as 'balanceOf(address)'
 * @param {string[]} outputTypes - The types it returns
 * @param {Array} [args] - The arguments, in the signature's order
 * @returns {Promise<Array>} The return values: integers as bigint, addresses
 * as lowercase hex and bytes as 0x-prefixed hex
 */
export async function callContract (query, to, signature, outputTypes, args = []) {
  const result = await query.call({ to, data: encodeCall(signature, args) })
  return decode(outputTypes, hexToBytes(result))
    .map((value) => (value instanceof Uint8Array ? bytesToHex(value) : value))
}
