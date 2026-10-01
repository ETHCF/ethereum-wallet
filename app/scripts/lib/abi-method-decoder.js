import abi from 'ethereumjs-abi'
import { BN } from 'ethereumjs-util'

const elementType = (type) => type.replace(/\[\d*\]$/u, '')

function formatValue (type, value) {
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(elementType(type), item))
  }
  if (type === 'address') {
    return `0x${value}`
  }
  if (Buffer.isBuffer(value)) {
    return `0x${value.toString('hex')}`
  }
  if (BN.isBN(value)) {
    return value.toString(10)
  }
  return value
}

// rawDecode returns addresses without the 0x prefix, which rawEncode would
// read as decimal numbers.
function toEncodable (type, value) {
  if (Array.isArray(value)) {
    return value.map((item) => toEncodable(elementType(type), item))
  }
  return type === 'address' ? `0x${value}` : value
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
      methods.set(abi.methodID(item.name, types).toString('hex'), { ...item, types })
    }
  }

  return function decodeMethod (data) {
    const hex = typeof data === 'string' ? data.replace(/^0x/iu, '').toLowerCase() : ''
    const method = methods.get(hex.slice(0, 8))
    if (!method || !(/^(?:[0-9a-f]{2})*$/u).test(hex)) {
      return undefined
    }
    const encoded = Buffer.from(hex.slice(8), 'hex')
    let values
    try {
      values = abi.rawDecode(method.types, encoded)
      // rawDecode zero-fills missing bytes and ignores dirty padding. Show
      // nothing rather than arguments the call data does not actually contain.
      // Trailing bytes are allowed, as Solidity accepts them.
      const canonical = abi.rawEncode(method.types, method.types.map((type, index) => toEncodable(type, values[index])))
      if (!encoded.slice(0, canonical.length).equals(canonical)) {
        return undefined
      }
    } catch (_) {
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
