
// The HD and imported-key keyrings come from the transaction codec bundle,
// which keeps modern EthereumJS out of Browserify (see transaction-codec.js).
// Read the classes on use, not on import: the bundle is a global set at startup.

export const HD_KEY_TREE = 'HD Key Tree'
export const SIMPLE_KEY_PAIR = 'Simple Key Pair'

export function getSoftwareKeyringTypes () {
  const { SimpleKeyring, HdKeyring } = globalThis.ecfWalletTransactionCodec
  return [SimpleKeyring, HdKeyring]
}

/**
 * The maintained keyrings ignore constructor data and deserialize
 * asynchronously, so always deserialize explicitly.
 *
 * @param {Function} Keyring - The keyring class
 * @param {*} [data] - The serialized keyring, if any
 * @returns {Promise<Object>} The keyring
 */
export async function createSoftwareKeyring (Keyring, data) {
  const keyring = new Keyring()
  if (data !== undefined) {
    await keyring.deserialize(data)
  }
  return keyring
}

/**
 * @param {*} mnemonic - A mnemonic as a string or as UTF-8 bytes
 * @returns {string} The mnemonic
 */
export function mnemonicToString (mnemonic) {
  return typeof mnemonic === 'string' ? mnemonic : Buffer.from(mnemonic).toString('utf8')
}

/**
 * Serializes a keyring for the vault. The HD keyring now serializes its
 * mnemonic as bytes; the vault keeps the string form older builds can read.
 *
 * @param {Object} keyring - The keyring
 * @returns {Promise<*>} The serialized keyring
 */
export async function serializeKeyring (keyring) {
  const data = await keyring.serialize()
  if (keyring.type === HD_KEY_TREE && data?.mnemonic !== undefined) {
    return { ...data, mnemonic: mnemonicToString(data.mnemonic) }
  }
  return data
}
