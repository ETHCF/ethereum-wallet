import { strict as assert } from 'assert'
import vm from 'vm'
import path from 'path'
import { build } from 'esbuild'
import { hdkey } from '@ethereumjs/wallet'
import { bufferToHex, publicToAddress, toChecksumAddress } from 'ethereumjs-util'
import browserOptions from '../../../development/build/browser-options'

describe('Browser hardware key derivation', function () {
  it('derives public keys and Trezor account pages in the browser bundle', async function () {
    this.timeout(10000)
    const parent = hdkey.EthereumHDKey.fromMasterSeed(Buffer.alloc(32, 1))._hdkey
    const publicKey = Buffer.from(parent.publicKey).toString('hex')
    const chainCode = Buffer.from(parent.chainCode).toString('hex')
    const result = await build({
      ...browserOptions(),
      stdin: {
        contents: `
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
        `,
        resolveDir: path.resolve(__dirname, '../../..'),
      },
      minify: true,
      define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
      write: false,
    })
    const browser = vm.createContext({ URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, navigator: { language: 'en-US', userAgent: 'Chrome' } })
    browser.self = browser
    browser.window = browser
    browser.AbortController = global.AbortController
    browser.AbortSignal = global.AbortSignal
    vm.runInContext(result.outputFiles[0].text, browser, { displayErrors: false })
    assert.deepEqual(Array.from(browser.derivedKeys), [0, 1, 4, 5].map((index) => Buffer.from(parent.deriveChild(index).publicKey).toString('hex')))
    assert.match(browser.invalidKeyError, /Public key must be 33 or 65 bytes/u)
    const pages = await browser.accountPages
    const accounts = Array.from(pages[0]).concat(Array.from(pages[1]))
    assert.equal(accounts.length, 10)
    accounts.forEach((account, index) => {
      assert.equal(account.index, index)
      assert.equal(account.address, toChecksumAddress(bufferToHex(publicToAddress(Buffer.from(parent.deriveChild(index).publicKey), true))))
    })
  })
})
