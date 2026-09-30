import { EventEmitter } from 'events'
import Transaction from 'ethereumjs-tx'
import extension from './extension-api'

let creatingTab
let connectionGeneration = 0

function tabsCall (method, ...args) {
  return new Promise((resolve, reject) => {
    extension.tabs[method](...args, (result) => {
      const error = extension.runtime.lastError
      if (error) {
        reject(new Error(error.message))
      } else {
        resolve(result)
      }
    })
  })
}

async function openTransportTab () {
  const url = extension.runtime.getURL('hardware.html')
  const contexts = await extension.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] })
  const tab = contexts.length ? await tabsCall('get', contexts[0].tabId) : await tabsCall('create', { url, active: false })
  if (tab.status === 'complete') {
    return
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Hardware wallet connection tab did not load. Please retry.'))
    }, 30000)
    function cleanup () {
      extension.tabs.onUpdated.removeListener(updated)
      extension.tabs.onRemoved.removeListener(removed)
      clearTimeout(timeout)
    }
    function updated (id, info) {
      if (id === tab.id && info.status === 'complete') {
        cleanup()
        resolve()
      }
    }
    function removed (id) {
      if (id === tab.id) {
        cleanup()
        reject(new Error('Hardware wallet connection tab was closed. Please retry.'))
      }
    }
    extension.tabs.onUpdated.addListener(updated)
    extension.tabs.onRemoved.addListener(removed)
    // Cover completion between tabs.create and listener registration.
    tabsCall('get', tab.id).then((current) => updated(tab.id, current), () => removed(tab.id))
  })
}

async function requestHardware (request) {
  const generation = connectionGeneration
  if (!creatingTab) {
    creatingTab = openTransportTab().finally(() => {
      creatingTab = null
    })
  }
  await creatingTab
  if (generation !== connectionGeneration) {
    throw new Error('Hardware wallet request cancelled because the wallet was locked.')
  }
  const response = await extension.runtime.sendMessage({ type: 'metamask-hardware-request', ...request })
  if (!response || response.error) {
    throw new Error(response?.error || 'Hardware wallet transport disconnected. Please retry.')
  }
  return response
}

export async function closeHardwareConnections () {
  connectionGeneration += 1
  if (creatingTab) {
    await creatingTab.catch(() => undefined)
  }
  const contexts = await extension.runtime.getContexts({
    contextTypes: ['TAB'], documentUrls: [extension.runtime.getURL('hardware.html')],
  })
  await Promise.all(contexts.map((context) => tabsCall('remove', context.tabId)))
}

export function createRemoteKeyring (type, send = requestHardware) {
  class RemoteKeyring extends EventEmitter {
    constructor (opts = {}) {
      super()
      this.type = type
      this.id = global.crypto.randomUUID()
      this.queue = Promise.resolve()
      this.generation = connectionGeneration
      this.deserialize(opts)
    }

    async serialize () {
      return this.state
    }

    async deserialize (opts = {}) {
      this.state = { ...opts, accounts: opts.accounts || [] }
    }

    async getAccounts () {
      return this.state.accounts.slice()
    }

    isUnlocked () {
      return Boolean(this.unlocked)
    }

    setAccountToUnlock (index) {
      this.state.unlockedAccount = Number(index)
    }

    setHdPath (hdPath) {
      if (type === 'Ledger Hardware' && this.state.accounts.length && !this.state.accountDetails) {
        this.state.legacyHdPath = this.state.legacyHdPath || this.state.hdPath
      }
      this.state.hdPath = hdPath
    }

    removeAccount (address) {
      this.state.accounts = this.state.accounts.filter((account) => account.toLowerCase() !== address.toLowerCase())
    }

    async forgetDevice () {
      await this.call('forgetDevice', [])
      this.id = global.crypto.randomUUID()
      this.state = { accounts: [] }
      this.unlocked = false
    }

    async call (method, args) {
      const operation = this.queue.then(async () => {
        if (this.generation !== connectionGeneration) {
          throw new Error('Hardware wallet request cancelled because the wallet was locked.')
        }
        const response = await send({ id: this.id, keyringType: type, method, args, state: this.state, network: this.network })
        if (this.generation !== connectionGeneration) {
          throw new Error('Hardware wallet request cancelled because the wallet was locked.')
        }
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

// Keep DOM-only SDKs out of both browsers' background bundles. The connection
// tab supplies the tabs/windows APIs that Trezor Connect needs under MV3.
export const Trezor = createRemoteKeyring('Trezor Hardware')
export const Ledger = createRemoteKeyring('Ledger Hardware')
