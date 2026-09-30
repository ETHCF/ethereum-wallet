import KeyringController from 'eth-keyring-controller'
import { signTypedData } from './signing-utils'

// Preserve existing vault serialization and account derivation. Only the
// EIP-712 implementation changes; private keys stay inside the background.
export default class ModernKeyringController extends KeyringController {
  async signTypedMessage (params, opts = { version: 'V1' }) {
    const keyring = await this.getKeyringForAccount(params.from)
    if (['HD Key Tree', 'Simple Key Pair'].includes(keyring.type)) {
      return signTypedData({
        privateKey: keyring.getPrivateKeyFor(params.from), data: params.data, version: opts.version,
      })
    }
    return super.signTypedMessage(params, opts)
  }
}
