import { strict as assert } from 'assert'
import fs from 'fs'
import os from 'os'
import vm from 'vm'
import path from 'path'
import webpack from 'webpack'
import { hdkey } from '@ethereumjs/wallet'
import { bytesToHex, publicToAddress, toChecksumAddress } from '@ethereumjs/util'
import createWebpackConfigs from '../../../development/build/webpack.config'

/**
 * Bundles a script the way the extension's hardware page is bundled.
 *
 * @param {string} source - The script
 * @returns {Promise<string>} The bundled script
 */
async function bundleLikeHardwarePage (source) {
  const [extension] = createWebpackConfigs({ devMode: false, testing: false })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardware-bundle-'))
  try {
    fs.writeFileSync(path.join(dir, 'entry.js'), source)
    const compiler = webpack({
      ...extension,
      entry: { bundle: path.join(dir, 'entry.js') },
      output: { ...extension.output, path: dir, sourceMapFilename: '[file].map' },
      devtool: false,
      resolve: { ...extension.resolve, modules: ['node_modules', path.resolve(__dirname, '../../../node_modules')] },
    })
    const stats = await new Promise((resolve, reject) => compiler.run((error, result) => (error ? reject(error) : resolve(result))))
    await new Promise((resolve) => compiler.close(resolve))
    if (stats.hasErrors()) {
      throw new Error(stats.toString('errors-only'))
    }
    return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('Browser hardware key derivation', function () {
  it('derives public keys and Trezor account pages in the browser bundle', async function () {
    this.timeout(60000)
    const parent = hdkey.EthereumHDKey.fromMasterSeed(Buffer.alloc(32, 1))._hdkey
    const publicKey = Buffer.from(parent.publicKey).toString('hex')
    const chainCode = Buffer.from(parent.chainCode).toString('hex')
    const bundle = await bundleLikeHardwarePage(`
      const HDKey = require('hdkey');
      const { TrezorKeyring } = require('@metamask/eth-trezor-keyring');
      const key = new HDKey();
      key.publicKey = Buffer.from('${publicKey}', 'hex');
      key.chainCode = Buffer.from('${chainCode}', 'hex');
      globalThis.derivedKeys = [0, 1, 4, 5].map(index => key.deriveChild(index).publicKey.toString('hex'));
      try { key.publicKey = Buffer.alloc(1); } catch (error) { globalThis.invalidKeyError = error.message; }
      const trezor = new TrezorKeyring({ bridge: {
        init: async () => undefined,
        getPublicKey: async () => ({ success: true, payload: { publicKey: '${publicKey}', chainCode: '${chainCode}' } }),
      } });
      globalThis.accountPages = trezor.init().then(async () => [await trezor.getFirstPage(), await trezor.getNextPage()]);
    `)
    const browser = vm.createContext({ URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, navigator: { language: 'en-US', userAgent: 'Chrome' } })
    browser.self = browser
    browser.window = browser
    browser.AbortController = global.AbortController
    browser.AbortSignal = global.AbortSignal
    vm.runInContext(bundle, browser, { displayErrors: false })
    assert.deepEqual(Array.from(browser.derivedKeys), [0, 1, 4, 5].map((index) => Buffer.from(parent.deriveChild(index).publicKey).toString('hex')))
    assert.match(browser.invalidKeyError, /Public key must be 33 or 65 bytes/u)
    const pages = await browser.accountPages
    const accounts = Array.from(pages[0]).concat(Array.from(pages[1]))
    assert.equal(accounts.length, 10)
    accounts.forEach((account, index) => {
      assert.equal(account.index, index)
      assert.equal(account.address, toChecksumAddress(bytesToHex(publicToAddress(Buffer.from(parent.deriveChild(index).publicKey), true))))
    })
  })
})
