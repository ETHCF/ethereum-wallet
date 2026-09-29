import Transaction from 'ethereumjs-tx'
import TrezorKeyring from 'eth-trezor-keyring'
import LedgerKeyring from '@metamask/eth-ledger-bridge-keyring'
import extension from 'extensionizer'

const types = new Map([[TrezorKeyring.type, TrezorKeyring], [LedgerKeyring.type, LedgerKeyring]])
const instances = new Map()
const methods = new Set(['unlock', 'addAccounts', 'getFirstPage', 'getNextPage', 'getPreviousPage', 'signTransaction', 'signMessage', 'signPersonalMessage', 'signTypedData', 'exportAccount'])

extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'metamask-hardware-request' || sender.id !== extension.runtime.id || sender.tab ||
      (sender.url && sender.url !== extension.runtime.getURL('service-worker.js'))) {
    return false
  }
  performRequest(message).then(respond, (error) => respond({ error: error.message }))
  return true
})

async function performRequest ({ id, keyringType, method, args, state, network }) {
  const Keyring = types.get(keyringType)
  if (!Keyring || !methods.has(method) || !Array.isArray(args) || typeof id !== 'string') {
    throw new Error('Invalid hardware wallet request')
  }
  let keyring = instances.get(id)
  if (keyring) {
    if (state.hdPath && keyring.setHdPath) {
      keyring.setHdPath(state.hdPath)
    }
    await keyring.deserialize(state)
  } else {
    keyring = new Keyring(state)
    instances.set(id, keyring)
  }
  keyring.network = network
  if (state.unlockedAccount !== undefined) {
    keyring.setAccountToUnlock(state.unlockedAccount)
  }
  if (method === 'signTransaction') {
    args[1] = new Transaction(args[1])
  }
  let result = await keyring[method](...args)
  if (method === 'signTransaction') {
    result = result.serialize().toString('hex')
  }
  return { result, state: await keyring.serialize(), unlocked: keyring.isUnlocked() }
}
