import { EventEmitter } from 'events'
import Transaction from 'ethereumjs-tx'
import TrezorKeyring from 'eth-trezor-keyring'
import LedgerKeyring from '@metamask/eth-ledger-bridge-keyring'
import extension from './extension-api'

let creatingDocument

async function requestHardware (request) {
  const url = extension.runtime.getURL('hardware.html')
  const contexts = await extension.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })
  if (!contexts.length) {
    if (!creatingDocument) {
      creatingDocument = extension.offscreen.createDocument({
        url: 'hardware.html',
        reasons: ['IFRAME_SCRIPTING'],
        justification: 'Communicate with the Ledger and Trezor hardware-wallet transport frames.',
      }).finally(() => {
        creatingDocument = null
      })
    }
    await creatingDocument
  }
  const response = await extension.runtime.sendMessage({ type: 'metamask-hardware-request', ...request })
  if (!response || response.error) {
    throw new Error(response?.error || 'Hardware wallet transport disconnected. Please retry.')
  }
  return response
}

export function createRemoteKeyring (type, send = requestHardware) {
  class RemoteKeyring extends EventEmitter {
    constructor (opts = {}) {
      super()
      this.type = type
      this.id = global.crypto.randomUUID()
      this.queue = Promise.resolve()
      this.deserialize(opts)
    }

    async serialize () {
      return this.state
    }

    async deserialize (opts = {}) {
      this.state = { ...opts, accounts: opts.accounts || [] }
    }

    async getAccounts () {
      return this.state.accounts
    }

    isUnlocked () {
      return Boolean(this.unlocked)
    }

    setAccountToUnlock (index) {
      this.state.unlockedAccount = Number(index)
    }

    setHdPath (hdPath) {
      this.state.hdPath = hdPath
    }

    removeAccount (address) {
      this.state.accounts = this.state.accounts.filter((account) => account.toLowerCase() !== address.toLowerCase())
    }

    forgetDevice () {
      this.id = global.crypto.randomUUID()
      this.state = { accounts: [] }
      this.unlocked = false
    }

    async call (method, args) {
      const operation = this.queue.then(async () => {
        const response = await send({ id: this.id, keyringType: type, method, args, state: this.state, network: this.network })
        this.state = response.state
        this.unlocked = response.unlocked
        return response.result
      })
      this.queue = operation.catch(() => undefined)
      return operation
    }

    async signTransaction (address, tx) {
      const signed = await this.call('signTransaction', [address, { ...tx.toJSON(true), chainId: tx.getChainId() }])
      return new Transaction(Buffer.from(signed, 'hex'))
    }
  }
  for (const method of ['unlock', 'addAccounts', 'getFirstPage', 'getNextPage', 'getPreviousPage', 'signMessage', 'signPersonalMessage', 'signTypedData', 'exportAccount']) {
    RemoteKeyring.prototype[method] = function (...args) {
      return this.call(method, args)
    }
  }
  RemoteKeyring.type = type
  return RemoteKeyring
}

// Firefox's MV3 event page has a DOM; Chromium's worker uses an offscreen
// document solely for hardware transport. Vaults stay in the worker.
const useOffscreen = typeof document === 'undefined' && extension.offscreen
export const Trezor = useOffscreen ? createRemoteKeyring(TrezorKeyring.type) : TrezorKeyring
export const Ledger = useOffscreen ? createRemoteKeyring(LedgerKeyring.type) : LedgerKeyring
