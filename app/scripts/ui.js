
// this must run before anything else
import './lib/freezeGlobals'

// polyfills
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch'
import '@formatjs/intl-relativetimeformat/polyfill'

import { EventEmitter } from 'events'
import PortStream from 'extension-port-stream'

import Dnode from 'dnode'
import Eth from 'ethjs'
import EthQuery from 'eth-query'
import StreamProvider from 'web3-stream-provider'
import log from 'loglevel'
import launchEcfWalletUi from '../../ui'
import extension from './lib/extension-api'
import { setupMultiplex } from './lib/stream-utils'
import ExtensionPlatform from './platforms/extension'
import {
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_POPUP,
} from './lib/enums'
import { getEnvironmentType } from './lib/util'

if (process.env.IN_TEST === 'true') {
  // eslint-disable-next-line global-require
  require('../../development/mock-fetch')()
}

start().catch(log.error)

async function start () {

  // create platform global
  global.platform = new ExtensionPlatform()

  // identify window type (popup, notification)
  const windowType = getEnvironmentType()

  // setup stream to background
  const extensionPort = extension.runtime.connect({ name: windowType })
  const connectionStream = new PortStream(extensionPort)
  // An open wallet UI is an active session. Messages keep its controller alive
  // while the user reviews an approval or edits a form.
  const heartbeat = setInterval(() => {
    // Fails when the extension is reloaded or updated.
    extension.runtime.sendMessage({ type: 'ecf-wallet-ui-active' }).catch(() => clearInterval(heartbeat))
  }, 20000)
  extensionPort.onDisconnect.addListener(() => {
    clearInterval(heartbeat)
    window.location.reload()
  })

  const activeTab = await queryCurrentActiveTab(windowType)
  initializeUiWithTab(activeTab)

  function displayCriticalError (container, err) {
    container.innerHTML = '<div class="critical-error">The ECF Wallet app failed to load: please open and close ECF Wallet again to restart.</div>'
    container.style.height = '80px'
    log.error(err.stack)
    throw err
  }

  function initializeUiWithTab (tab) {
    const container = document.getElementById('app-content')
    initializeUi(tab, container, connectionStream, (err, store) => {
      if (err) {
        displayCriticalError(container, err)
        return
      }

      const state = store.getState()
      const { ecfWallet: { completedOnboarding } = {} } = state

      if (!completedOnboarding && windowType !== ENVIRONMENT_TYPE_FULLSCREEN) {
        global.platform.openExtensionInBrowser()
      }
    })
  }
}

async function queryCurrentActiveTab (windowType) {
  // At the time of writing we only have the `activeTab` permission which means
  // that this query will only succeed in the popup context (i.e. after a "browserAction")
  if (windowType !== ENVIRONMENT_TYPE_POPUP) {
    return {}
  }

  const [activeTab] = await extension.tabs.query({ active: true, currentWindow: true })
  const { id, title, url } = activeTab
  const { origin, protocol } = url ? new URL(url) : {}

  if (!origin || origin === 'null') {
    return {}
  }

  return { id, title, origin, protocol, url }
}

function initializeUi (activeTab, container, connectionStream, cb) {
  connectToAccountManager(connectionStream, (err, backgroundConnection) => {
    if (err) {
      cb(err)
      return
    }

    launchEcfWalletUi({
      activeTab,
      container,
      backgroundConnection,
    }, cb)
  })
}

/**
 * Establishes a connection to the background and a Web3 provider
 *
 * @param {PortDuplexStream} connectionStream - PortStream instance establishing a background connection
 * @param {Function} cb - Called when controller connection is established
 */
function connectToAccountManager (connectionStream, cb) {
  const mx = setupMultiplex(connectionStream)
  setupControllerConnection(mx.createStream('controller'), cb)
  setupWeb3Connection(mx.createStream('provider'))
}

/**
 * Establishes a streamed connection to a Web3 provider
 *
 * @param {PortDuplexStream} connectionStream - PortStream instance establishing a background connection
 */
function setupWeb3Connection (connectionStream) {
  const providerStream = new StreamProvider()
  providerStream.pipe(connectionStream).pipe(providerStream)
  connectionStream.on('error', console.error.bind(console))
  providerStream.on('error', console.error.bind(console))
  global.ethereumProvider = providerStream
  global.ethQuery = new EthQuery(providerStream)
  global.eth = new Eth(providerStream)
}

/**
 * Establishes a streamed connection to the background account manager
 *
 * @param {PortDuplexStream} connectionStream - PortStream instance establishing a background connection
 * @param {Function} cb - Called when the remote account manager connection is established
 */
function setupControllerConnection (connectionStream, cb) {
  const eventEmitter = new EventEmitter()
  const backgroundDnode = Dnode({
    sendUpdate (state) {
      eventEmitter.emit('update', state)
    },
  })
  connectionStream.pipe(backgroundDnode).pipe(connectionStream)
  backgroundDnode.once('remote', function (backgroundConnection) {
    backgroundConnection.on = eventEmitter.on.bind(eventEmitter)
    cb(null, backgroundConnection)
  })
}
