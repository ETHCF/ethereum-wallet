import * as ethUtil from 'ethereumjs-util'

const accountImporter = {

  async importAccount (strategy, args) {
    const importer = this.strategies[strategy]
    return importer(...args)
  },

  strategies: {
    'Private Key': (privateKey) => {
      if (!privateKey) {
        throw new Error('Cannot import an empty key.')
      }

      const prefixed = ethUtil.addHexPrefix(privateKey)
      // A private key is 32 bytes; isValidPrivate throws for other input.
      if (!(/^0x[0-9a-f]{64}$/iu).test(prefixed) || !ethUtil.isValidPrivate(ethUtil.toBuffer(prefixed))) {
        throw new Error('Cannot import invalid private key.')
      }

      const stripped = ethUtil.stripHexPrefix(prefixed)
      return stripped
    },
    // Keystore decryption uses the modern EthereumJS bundle (see transaction-codec.js).
    'JSON File': (input, password) => globalThis.ecfWalletTransactionCodec.decryptKeystore(input, password),
  },

}

export default accountImporter
