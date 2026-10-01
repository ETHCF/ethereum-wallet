const fs = require('fs')
const path = require('path')
// This package uses exports without a main field, which ESLint 6 cannot resolve.
// eslint-disable-next-line import/no-unresolved
const { polyfillNode } = require('esbuild-plugin-polyfill-node')

/**
 * Yarn nests a copy of readable-stream 3 under each @metamask package, because
 * the hoisted copy is version 2. Bundle one copy for all of them.
 *
 * @returns {Object} An esbuild plugin
 */
function dedupeReadableStream () {
  const fromPackage = path.dirname(require.resolve('@metamask/post-message-stream'))
  const { version } = JSON.parse(fs.readFileSync(require.resolve('readable-stream/package.json', { paths: [fromPackage] }), 'utf8'))
  if (!version.startsWith('3.')) {
    throw new Error(`Expected readable-stream 3 for @metamask packages, found ${version}`)
  }
  const browserEntry = require.resolve('readable-stream/readable-browser.js', { paths: [fromPackage] })
  return {
    name: 'dedupe-readable-stream',
    setup (build) {
      // esbuild filters are Go regular expressions, which reject the u flag.
      // eslint-disable-next-line require-unicode-regexp
      build.onResolve({ filter: /^readable-stream$/ }, ({ importer }) => {
        return (/[\\/]node_modules[\\/]@metamask[\\/]/u).test(importer) ? { path: browserEntry } : undefined
      })
    },
  }
}

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.pageScript] - For scripts injected into every page,
 * which need no crypto and should stay small.
 * @returns {Object} esbuild options
 */
module.exports = function browserOptions ({ pageScript = false } = {}) {
  if (pageScript) {
    return {
      bundle: true,
      platform: 'browser',
      target: ['chrome120', 'firefox128'],
      plugins: [dedupeReadableStream(), polyfillNode({ polyfills: { assert: false, crypto: false, stream: false } })],
      // readable-stream is bundled already; the Node stream polyfill would add a
      // second, larger copy.
      alias: { stream: require.resolve('readable-stream') },
      loader: { '.svg': 'text' },
    }
  }
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
