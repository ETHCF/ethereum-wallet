const fs = require('fs')
const path = require('path')
// This package uses exports without a main field, which the eslint-plugin-import resolver cannot resolve.
// eslint-disable-next-line import/no-unresolved
const { polyfillNode } = require('esbuild-plugin-polyfill-node')

/**
 * @returns {string} The browser entry of the readable-stream 3 copy that Yarn
 * nests under the @metamask packages
 */
function readableStreamBrowserEntry () {
  const fromPackage = path.dirname(require.resolve('@metamask/post-message-stream'))
  const { version } = JSON.parse(fs.readFileSync(require.resolve('readable-stream/package.json', { paths: [fromPackage] }), 'utf8'))
  if (!version.startsWith('3.')) {
    throw new Error(`Expected readable-stream 3 for @metamask packages, found ${version}`)
  }
  return require.resolve('readable-stream/readable-browser.js', { paths: [fromPackage] })
}

/**
 * The @metamask packages in page scripts use readable-stream 3, nested under
 * each of them, while the wallet's own code uses the hoisted version 4. Bundle
 * a single copy of version 3 for all of them, since page scripts are injected
 * into every page; the wallet's streams work the same on either version.
 *
 * @returns {Object} An esbuild plugin
 */
function dedupeReadableStream () {
  const browserEntry = readableStreamBrowserEntry()
  return {
    name: 'dedupe-readable-stream',
    setup (build) {
      // esbuild filters are Go regular expressions, which reject the u flag.
      // eslint-disable-next-line require-unicode-regexp
      build.onResolve({ filter: /^readable-stream$/ }, () => ({ path: browserEntry }))
    },
  }
}

/**
 * @metamask/providers logs and throws messages that name MetaMask, and does not
 * export them for us to replace. Rename the wallet in them as they are bundled.
 * In these files, MetaMask as a whole word appears only in strings and comments.
 *
 * @returns {Object} An esbuild plugin
 */
function rebrandProviderMessages () {
  return {
    name: 'rebrand-provider-messages',
    setup (build) {
      // eslint-disable-next-line require-unicode-regexp
      build.onLoad({ filter: /[\\/]@metamask[\\/]providers[\\/]dist[\\/](messages|BaseProvider|StreamProvider|utils)\.(c|m)js$/ }, async ({ path: file }) => {
        const source = await fs.promises.readFile(file, 'utf8')
        if (!source.includes('MetaMask:') && !source.includes('MetaMask -')) {
          throw new Error(`Expected MetaMask messages in ${file}; update rebrandProviderMessages`)
        }
        // Leave links such as github.com/MetaMask/... intact.
        return { contents: source.replace(/\bMetaMask\b(?!\/)/gu, 'ECF Wallet'), loader: 'js' }
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
      plugins: [dedupeReadableStream(), rebrandProviderMessages(), polyfillNode({ polyfills: { assert: false, crypto: false, stream: false } })],
      // readable-stream is bundled already; the Node stream polyfill would add a
      // second, larger copy.
      alias: { stream: readableStreamBrowserEntry() },
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
