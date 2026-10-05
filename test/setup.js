// ES module dependencies, such as @metamask/utils, import the CommonJS debug
// module. With @babel/register's loader hook in place, Node gives that
// module's own require calls ES namespaces when an ES module loads it first, so
// debug would export an object. Load it through require before anything imports it.
require('debug');
require('@babel/register');

require('./helper');

// react-redux 9 exports read-only getters, which sinon cannot stub. Tests stub
// its hooks, so every importer gets a plain copy of the exports instead. The
// copy keeps the ES module flag so Babel's imports share it rather than wrap it.
require('react-redux');

const reactReduxModule = require.cache[require.resolve('react-redux')];
reactReduxModule.exports = Object.defineProperty(
  { ...reactReduxModule.exports },
  '__esModule',
  { value: true },
);

window.SVGPathElement = window.SVGPathElement || { prototype: {} };
global.indexedDB = {};
