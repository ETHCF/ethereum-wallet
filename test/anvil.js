const path = require('path')
const { createAnvil } = require('@viem/anvil')
const { privateToAddress, toBuffer, bufferToHex } = require('ethereumjs-util')

// `yarn foundryup` installs the pinned, checksum-verified Anvil binary here.
const ANVIL_BINARY = path.resolve(__dirname, '../node_modules/.bin/anvil')

const defaultOptions = {
  // Ganache's default: 100 ETH in each of the mnemonic's accounts.
  balance: 100,
  blockTime: 2,
  // Ganache's chain ID. Anvil also reports it as the network ID (net_version).
  chainId: 1337,
  // Ganache's hardfork, from before EIP-1559 fees; tests of typed transactions
  // ask for a later one.
  hardfork: 'muirglacier',
  mnemonic: 'phrase upgrade clock rough situate wedding elder clever doctor stamp excess tent',
  port: 8545,
}

/**
 * A local test chain, replacing Ganache. Accepts the options the tests passed to
 * Ganache: `blockTime`, `mnemonic`, `port`, and `accounts` (private keys to fund).
 */
class Anvil {
  async start (opts = {}) {
    const { accounts = [], ...options } = { ...defaultOptions, ...opts }
    this._port = options.port
    this._anvil = createAnvil({ ...options, anvilBinary: ANVIL_BINARY })
    await this._anvil.start()
    // Ganache created accounts from private keys; Anvil funds them instead.
    for (const { secretKey, balance } of accounts) {
      const address = bufferToHex(privateToAddress(toBuffer(secretKey)))
      await this.request('anvil_setBalance', [address, `0x${BigInt(balance).toString(16)}`])
    }
    return { port: this._port }
  }

  async request (method, params = []) {
    const response = await globalThis.fetch(`http://127.0.0.1:${this._port}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    })
    const { result, error } = await response.json()
    if (error) {
      throw new Error(`Anvil ${method} failed: ${error.message}`)
    }
    return result
  }

  async quit () {
    if (!this._anvil) {
      throw new Error('Server not running yet')
    }
    await this._anvil.stop()
  }
}

module.exports = Anvil
