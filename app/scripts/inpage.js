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
import LocalMessageDuplexStream from 'post-message-stream'
import { initProvider, setGlobalProvider } from '@metamask/inpage-provider'
import shouldInjectProvider from './lib/should-inject-provider'
import announceProvider from './lib/announce-provider'

// TODO:deprecate:2020
import setupWeb3 from './lib/setupWeb3'
/* eslint-enable import/first */

restoreContextAfterImports()

log.setDefaultLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn')

//
// setup plugin communication
//

if (shouldInjectProvider()) {
  // setup background connection
  const ecfWalletStream = new LocalMessageDuplexStream({
    name: 'ecf-wallet-inpage',
    target: 'ecf-wallet-contentscript',
  })

  const provider = initProvider({
    connectionStream: ecfWalletStream,
    shouldSetOnWindow: false,
  })
  // Dapps handle chainChanged; disable the legacy page reload and its warning.
  provider.autoRefreshOnNetworkChange = false

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

  // TODO:deprecate:2020
  if (window.ethereum === provider && typeof window.web3 === 'undefined') {
    setupWeb3(log)
  }
}
