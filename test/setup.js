require('@babel/register')

require('./helper')
global.ecfWalletTransactionCodec = require('../app/scripts/lib/transaction-codec-implementation')
global.ecfWalletModernControllers = require('../app/scripts/lib/modern-controllers-implementation')

window.SVGPathElement = window.SVGPathElement || { prototype: {} }
global.indexedDB = {}
