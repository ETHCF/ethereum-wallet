import querystring from 'querystring'
import pump from 'pump'
import LocalMessageDuplexStream from 'post-message-stream'
import ObjectMultiplex from 'obj-multiplex'
import extension from 'extensionizer'
import shouldInjectProvider from './lib/should-inject-provider'
import ReconnectingPortStream from './lib/reconnecting-port-stream'

if (shouldInjectProvider()) {
  start()
}

/**
 * Sets up the stream communication and submits site metadata
 *
 */
async function start () {
  await setupStreams()
  await domIsReady()
}

/**
 * Sets up two-way communication streams between the
 * browser extension and local per-page browser context.
 *
 */
async function setupStreams () {
  // the transport-specific streams for communication between inpage and background
  const pageStream = new LocalMessageDuplexStream({
    name: 'contentscript',
    target: 'inpage',
  })
  const extensionStream = new ReconnectingPortStream(() => extension.runtime.connect({ name: 'contentscript' }))

  // create and connect channel muxers
  // so we can handle the channels individually
  const pageMux = new ObjectMultiplex()
  pageMux.setMaxListeners(25)
  const extensionMux = new ObjectMultiplex()
  extensionMux.setMaxListeners(25)

  pump(
    pageMux,
    pageStream,
    pageMux,
    (err) => logStreamDisconnectWarning('ecf-wallet Inpage Multiplex', err),
  )
  pump(
    extensionMux,
    extensionStream,
    extensionMux,
    (err) => logStreamDisconnectWarning('ecf-wallet Background Multiplex', err),
  )

  // forward communication across inpage-background for these channels only
  forwardTrafficBetweenMuxers('provider', pageMux, extensionMux)
  forwardTrafficBetweenMuxers('publicConfig', pageMux, extensionMux)

  // connect "phishing" channel to warning system
  const phishingStream = extensionMux.createStream('phishing')
  phishingStream.once('data', redirectToPhishingWarning)
}

function forwardTrafficBetweenMuxers (channelName, muxA, muxB) {
  const channelA = muxA.createStream(channelName)
  const channelB = muxB.createStream(channelName)
  pump(
    channelA,
    channelB,
    channelA,
    (err) => logStreamDisconnectWarning(`ecf-wallet muxed traffic for channel "${channelName}" failed.`, err),
  )
}

/**
 * Error handler for page to extension stream disconnections
 *
 * @param {string} remoteLabel - Remote stream name
 * @param {Error} err - Stream connection error
 */
function logStreamDisconnectWarning (remoteLabel, err) {
  let warningMsg = `EcfWalletContentscript - lost connection to ${remoteLabel}`
  if (err) {
    warningMsg += `\n${err.stack}`
  }
  console.warn(warningMsg)
}

/**
 * Redirects the current page to a phishing information page
 */
function redirectToPhishingWarning () {
  console.log('ecf-wallet - routing to Phishing Warning component')
  const extensionURL = extension.runtime.getURL('phishing.html')
  window.location.href = `${extensionURL}#${querystring.stringify({
    hostname: window.location.hostname,
    href: window.location.href,
  })}`
}

/**
 * Returns a promise that resolves when the DOM is loaded (does not wait for images to load)
 */
async function domIsReady () {
  // already loaded
  if (['interactive', 'complete'].includes(document.readyState)) {
    return undefined
  }
  // wait for load
  return new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }))
}
