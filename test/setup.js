require('@babel/register')

require('./helper')
global.ecfWalletTransactionCodec = require('../app/scripts/lib/transaction-codec-implementation')

window.SVGPathElement = window.SVGPathElement || { prototype: {} }
global.indexedDB = {}
