import nock from 'nock'
import Enzyme from 'enzyme'
import Adapter from '@cfaester/enzyme-adapter-react-18'
import log from 'loglevel'
import { JSDOM } from 'jsdom'
import 'react-redux'
import Anvil from './anvil'
import { getTestSeed } from './stub/provider'

nock.disableNetConnect()
nock.enableNetConnect('localhost')

// catch rejections that are still unhandled when tests exit
const unhandledRejections = new Map()
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled rejection:', reason)
  unhandledRejections.set(promise, reason)
})
process.on('rejectionHandled', (promise) => {
  console.log(`handled: ${unhandledRejections.get(promise)}`)
  unhandledRejections.delete(promise)
})

process.on('exit', () => {
  if (unhandledRejections.size > 0) {
    console.error(`Found ${unhandledRejections.size} unhandled rejections:`)
    for (const reason of unhandledRejections.values()) {
      console.error('Unhandled rejection: ', reason)
    }
    process.exit(1)
  }
})

Enzyme.configure({ adapter: new Adapter() })

// React Redux exports read-only getters, which sinon cannot stub. Tests stub
// its hooks (`sinon.stub(reactRedux, 'useSelector')`), so give every module a
// plain, writable copy of the exports instead.
const reactReduxModule = require.cache[require.resolve('react-redux')]

reactReduxModule.exports = { ...reactReduxModule.exports }

// Local test chain on port 8545, mining each transaction immediately. Mocha
// loads every test file before running any, so it is listening by then; it
// is stopped when the test process exits. A zero base fee keeps the low gas
// prices the tests use valid, as on Ganache, which predated EIP-1559.
// A chain that never starts used to surface as a dozen unrelated assertion
// failures in whichever tests happened to need it, so fail loudly instead.
new Anvil()
  .start({ blockTime: undefined, chainId: 1337, mnemonic: getTestSeed(), blockBaseFeePerGas: 0 })
  .catch((error) => {
    console.error('Anvil failed to start; run `yarn foundryup`.', error)
    process.exit(1)
  })

log.setDefaultLevel(5)
global.log = log

//
// polyfills
//

// dom
const jsdom = new JSDOM()
global.window = jsdom.window

// required by `trezor-connect/node_modules/whatwg-fetch`
global.self = window
// required by `dom-helpers` and various other libraries
global.document = window.document
// required by `react-tippy`
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true })
global.Element = window.Element
// required by `react-popper`
global.HTMLElement = window.HTMLElement

// required by any components anchored on `popover-content`
const popoverContent = window.document.createElement('div')
popoverContent.setAttribute('id', 'popover-content')
window.document.body.appendChild(popoverContent)

// delete AbortController added by jsdom so it can be polyfilled correctly below
delete window.AbortController

// fetch
const fetch = require('node-fetch')

const { Headers, Request, Response } = fetch
Object.assign(window, { fetch, Headers, Request, Response })

require('abortcontroller-polyfill/dist/polyfill-patch-fetch')

// localStorage
Object.defineProperty(window, 'localStorage', { value: {}, configurable: true })

// override @metamask/logo
window.requestAnimationFrame = () => undefined

// The extension runs with full WebCrypto (getRandomValues, randomUUID, subtle).
if (!window.crypto?.subtle || !window.crypto?.randomUUID) {
  // eslint-disable-next-line global-require
  Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true, writable: true })
}
