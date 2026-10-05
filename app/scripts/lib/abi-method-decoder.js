import { encode, decode } from '@metamask/abi-utils'
import { bytesToHex, utf8ToBytes } from '@ethereumjs/util'
import { keccak_256 as keccak256 } from '@noble/hashes/sha3.js'

const elementType = (type) => type.replace(/\[\d*\]$/u, '')

function formatValue (type, value) {
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(elementType(type), item))
  }
  if (value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString('hex')}`
  }
  if (typeof value === 'bigint') {
    return value.toString(10)
  }
  return value
}

/**
 * @param {string} signature - A function signature, such as 'transfer(address,uint256)'
 * @returns {string} The 4-byte selector as unprefixed lowercase hex
 */
export function functionSelector (signature) {
  return bytesToHex(keccak256(utf8ToBytes(signature)).slice(0, 4)).slice(2)
}

/**
 * Decodes ABI-encoded arguments, rejecting data that does not contain them.
 *
 * @param {string[]} types - The argument types
 * @param {string} hex - The encoded arguments, without selector or 0x prefix
 * @returns {Array|undefined} The values (addresses as lowercase hex, integers
 * as bigint, bytes as Uint8Array), or undefined if the data is malformed
 */
export function decodeArguments (types, hex) {
  if (typeof hex !== 'string' || !(/^(?:[0-9a-f]{2})*$/iu).test(hex)) {
    return undefined
  }
  const encoded = Buffer.from(hex, 'hex')
  try {
    const values = decode(types, encoded)
    // The decoder zero-fills missing bytes and ignores dirty padding. Return
    // nothing rather than arguments the data does not actually contain.
    // Trailing bytes are allowed, as Solidity accepts them.
    const canonical = Buffer.from(encode(types, values))
    return encoded.slice(0, canonical.length).equals(canonical) ? values : undefined
  } catch (_) {
    return undefined
  }
}

/**
 * Creates a decoder for calls to the functions of an ABI, returning the same
 * shape as abi-decoder's decodeMethod: integers as decimal strings, addresses
 * as lowercase hex.
 *
 * @param {Object[]} abiDefinition - The contract ABI
 * @returns {Function} Takes call data and returns { name, params } or undefined
 */
export default function createMethodDecoder (abiDefinition) {
  const methods = new Map()
  for (const item of abiDefinition) {
    if (item.type === 'function') {
      const types = item.inputs.map(({ type }) => type)
      methods.set(functionSelector(`${item.name}(${types.join(',')})`), { ...item, types })
    }
  }

  return function decodeMethod (data) {
    const hex = typeof data === 'string' ? data.replace(/^0x/iu, '').toLowerCase() : ''
    const method = methods.get(hex.slice(0, 8))
    const values = method && decodeArguments(method.types, hex.slice(8))
    if (!values) {
      return undefined
    }
    return {
      name: method.name,
      params: method.inputs.map((input, index) => ({
        name: input.name,
        value: formatValue(input.type, values[index]),
        type: input.type,
      })),
    }
  }
}
