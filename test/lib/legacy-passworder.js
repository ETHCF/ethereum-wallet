import * as passworder from '@metamask/browser-passworder'

// Reads and writes vaults as browser-passworder 2 did, which the wallet used
// before: PBKDF2-SHA256 with 10,000 rounds and no key metadata.
const LEGACY_DERIVATION = { algorithm: 'PBKDF2', params: { iterations: 10000 } }

const withoutKeyMetadata = (vault) => {
  const payload = JSON.parse(vault)
  delete payload.keyMetadata
  return JSON.stringify(payload)
}

const legacyPassworder = {
  async encrypt (password, data) {
    return withoutKeyMetadata(await passworder.encrypt(password, data, undefined, undefined, LEGACY_DERIVATION))
  },

  // Ignores key metadata, as browser-passworder 2 did.
  decrypt (password, vault) {
    return passworder.decrypt(password, withoutKeyMetadata(vault))
  },
}

export default legacyPassworder
