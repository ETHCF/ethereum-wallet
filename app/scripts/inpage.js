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
import { setGlobalProvider } from '@metamask/providers/initializeInpageProvider'
import shouldInjectProvider from './lib/should-inject-provider'
import announceProvider from './lib/announce-provider'
/* eslint-enable import/first */

restoreContextAfterImports()

log.setDefaultLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn')

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

  const inpageProvider = new MetaMaskInpageProvider(mux.createStream('provider'), {
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
  try {
    if (!window.ethereum) {
      setGlobalProvider(provider)
    }
  } catch (error) {
    log.debug('ecf-wallet - could not set the legacy provider', error)
  }

  announceProvider(provider)
}
