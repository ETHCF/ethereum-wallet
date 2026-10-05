require('@babel/register')

require('./helper')

// react-redux 9 exports read-only getters, which sinon cannot stub. Tests stub
// its hooks, so every importer gets a plain copy of the exports instead. The
// copy keeps the ES module flag so Babel's imports share it rather than wrap it.
require('react-redux')

const reactReduxModule = require.cache[require.resolve('react-redux')]
reactReduxModule.exports = Object.defineProperty({ ...reactReduxModule.exports }, '__esModule', { value: true })

global.ecfWalletTransactionCodec = require('../app/scripts/lib/transaction-codec-implementation')
global.ecfWalletModernControllers = require('../app/scripts/lib/modern-controllers-implementation')

window.SVGPathElement = window.SVGPathElement || { prototype: {} }
global.indexedDB = {}
