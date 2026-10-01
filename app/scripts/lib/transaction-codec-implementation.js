import { createTx, createTxFromRLP } from '@ethereumjs/tx'
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common'
import { ParsedMessage } from '@spruceid/siwe-parser'
import { signTypedData, TypedDataUtils, typedSignatureHash, TYPED_MESSAGE_SCHEMA } from '@metamask/eth-sig-util'
import { Wallet, thirdparty } from '@ethereumjs/wallet'
import { bytesToHex } from '@ethereumjs/util'

// The HD and imported-key keyrings depend on modern EthereumJS too.
export { HdKeyring } from '@metamask/eth-hd-keyring'
export { default as SimpleKeyring } from '@metamask/eth-simple-keyring'

export { signTypedData, TYPED_MESSAGE_SCHEMA }

/**
 * Decrypts an EtherWallet or V3 keystore file.
 *
 * @param {string} input - The keystore file contents
 * @param {string} password - The keystore password
 * @returns {Promise<string>} The 0x-prefixed private key
 */
export async function decryptKeystore (input, password) {
  let wallet
  try {
    wallet = await thirdparty.fromEtherWallet(input, password)
  } catch (_) {
    // Not EtherWallet's format; V3 files may use mixed-case hex.
    wallet = await Wallet.fromV3(input, password, true)
  }
  return bytesToHex(wallet.getPrivateKey())
}

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
