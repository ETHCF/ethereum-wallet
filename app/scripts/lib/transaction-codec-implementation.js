import { createTx, createTxFromRLP } from '@ethereumjs/tx'
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common'
import { ParsedMessage } from '@spruceid/siwe-parser'
import { signTypedData, TypedDataUtils, typedSignatureHash, TYPED_MESSAGE_SCHEMA } from '@metamask/eth-sig-util'

export { signTypedData, TYPED_MESSAGE_SCHEMA }

export function validateTypedData (data, version) {
  return version === 'V1' ? typedSignatureHash(data) : TypedDataUtils.eip712Hash(data, version)
}

export function parseSIWE (message) {
  return { ...new ParsedMessage(message) }
}

function options (chainId, type) {
  return {
    common: createCustomCommon({ chainId }, Mainnet, {
      hardfork: Number(type) === 4 ? Hardfork.Prague : Hardfork.London,
    }),
  }
}

export function createTypedTransaction (params, chainId) {
  return createTx({ ...params, gasLimit: params.gasLimit || params.gas, chainId }, options(chainId, params.type))
}

export function decodeTypedTransaction (bytes, chainId) {
  return createTxFromRLP(bytes, options(chainId, bytes[0]))
}
