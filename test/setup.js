require('@babel/register')

require('./helper')
global.metamaskTransactionCodec = require('../app/scripts/lib/transaction-codec-implementation')

window.SVGPathElement = window.SVGPathElement || { prototype: {} }
global.indexedDB = {}
