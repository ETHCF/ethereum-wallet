// This package uses exports without a main field, which ESLint 6 cannot resolve.
// eslint-disable-next-line import/no-unresolved
const { polyfillNode } = require('esbuild-plugin-polyfill-node')

module.exports = function browserOptions () {
  return {
    bundle: true,
    platform: 'browser',
    target: ['chrome120', 'firefox128'],
    // Hardware HD derivation needs real hashes/HMACs, not the default empty crypto stub.
    plugins: [polyfillNode({ polyfills: { assert: false, crypto: true } })],
    // hdkey calls require('assert') directly. The default ESM shim exposes a
    // namespace object to CommonJS callers instead of the callable function.
    alias: { assert: require.resolve('assert/') },
  }
}
