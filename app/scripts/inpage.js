// need to make sure we aren't affected by overlapping namespaces
// and that we dont affect the app with our namespace
// mostly a fix for web3's BigNumber if AMD's "define" is defined...
let __define

/**
 * Caches reference to global define object and deletes it to
 * avoid conflicts with other global define objects, such as
 * AMD's define function
 */
const cleanContextForImports = () => {
  __define = global.define
  try {
    global.define = undefined
  } catch (_) {
    console.warn('ecf-wallet - global.define could not be deleted.')
  }
}

/**
 * Restores global define object from cached reference
 */
const restoreContextAfterImports = () => {
  try {
    global.define = __define
  } catch (_) {
    console.warn('ecf-wallet - global.define could not be overwritten.')
  }
}

cleanContextForImports()

/* eslint-disable import/first */
import log from 'loglevel'
import pump from 'pump'
import { WindowPostMessageStream } from '@metamask/post-message-stream'
import ObjectMultiplex from '@metamask/object-multiplex'
import { MetaMaskInpageProvider } from '@metamask/providers'
import shouldInjectProvider from './lib/should-inject-provider'
import announceProvider from './lib/announce-provider'
/* eslint-enable import/first */

restoreContextAfterImports()

log.setDefaultLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn')

/**
 * The upstream provider, identified as ECF Wallet: isECFWallet and _ecfwallet
 * replace isMetaMask and _metamask, so dapps do not mistake it for MetaMask.
 */
class ECFWalletInpageProvider extends MetaMaskInpageProvider {
  constructor (connectionStream, options) {
    super(connectionStream, options)
    delete this.isMetaMask
    this.isECFWallet = true

    // The upstream namespace warns under MetaMask's name, so warn under ours instead.
    const experimentalApi = this._metamask
    delete this._metamask
    this._sentWarnings.experimentalMethods = true
    let warned = false
    this._ecfwallet = new Proxy(experimentalApi, {
      get: (target, property) => {
        if (!warned) {
          log.warn(`ECF Wallet: 'ethereum._ecfwallet' exposes non-standard, experimental methods. They may be removed or changed without warning.`)
          warned = true
        }
        return Reflect.get(target, property)
      },
    })
  }
}

//
// setup plugin communication
//

if (shouldInjectProvider()) {
  // setup background connection
  const ecfWalletStream = new WindowPostMessageStream({
    name: 'ecf-wallet-inpage',
    target: 'ecf-wallet-contentscript',
  })
  // The content script forwards each named channel to the background.
  const mux = new ObjectMultiplex()
  pump(ecfWalletStream, mux, ecfWalletStream, (error) => {
    log.warn('ecf-wallet - lost connection to the content script', error)
  })

  const inpageProvider = new ECFWalletInpageProvider(mux.createStream('provider'), {
    logger: log,
    // The site's name and icon are shown when it asks to connect.
    shouldSendMetadata: true,
  })
  // As upstream does: pages cannot delete the provider's properties.
  const provider = new Proxy(inpageProvider, {
    deleteProperty: () => true,
    get: (target, property) => target[property],
  })

  // Preserve another wallet's legacy globals. Discovery works independently of
  // window.ethereum, even when another extension makes that property read-only.
  setLegacyProvider(provider)

  announceProvider(provider)
}

/**
 * Sets window.ethereum unless another wallet already set it or claimed it with a
 * read-only property or a getter, which may still return nothing.
 *
 * @param {Object} provider - The provider
 */
function setLegacyProvider (provider) {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum')
  const claimed = descriptor && (descriptor.get || descriptor.set ? !descriptor.set : !descriptor.writable)
  if (window.ethereum || claimed) {
    return
  }
  try {
    window.ethereum = provider
    window.dispatchEvent(new window.Event('ethereum#initialized'))
  } catch (error) {
    log.debug('ecf-wallet - could not set the legacy provider', error)
  }
}
