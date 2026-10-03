import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import WalletController from '../../../app/scripts/ecf-wallet-controller'

const account = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc'

function createController ({ unlocked = true, network = '1337', chainId = '0x539' } = {}) {
  const controller = Object.create(WalletController.prototype)
  EventEmitter.call(controller)
  controller.unlocked = unlocked
  controller.isUnlocked = () => controller.unlocked
  controller.getState = () => ({ network, provider: { type: 'rpc' } })
  controller.networkController = { getChainId: () => chainId }
  controller.permissionsController = { getAccounts: async () => [account] }
  controller.connections = {}
  return controller
}

function connect (controller, origin) {
  const engine = new EventEmitter()
  const notifications = []
  engine.on('notification', (payload) => notifications.push(payload))
  controller.connections[origin] = { ...controller.connections[origin], [Object.keys(controller.connections[origin] || {}).length]: { engine } }
  return notifications
}

describe('Provider state', function () {
  describe('Provider state for sites', function () {
    it('shares permitted accounts only while unlocked', async function () {
      const controller = createController()
      assert.deepEqual(await controller.getProviderState('https://dapp.test'), {
        isUnlocked: true, chainId: '0x539', networkVersion: '1337', isConnected: true, accounts: [account],
      })
      controller.unlocked = false
      assert.deepEqual((await controller.getProviderState('https://dapp.test')).accounts, [])
    })

    it('reports a loading network as disconnected', function () {
      const controller = createController({ network: 'loading' })
      assert.deepEqual(controller.getProviderNetworkState(), { chainId: '0x539', networkVersion: 'loading', isConnected: false })
    })

    it('hides accounts from every connection on lock and restores them per origin on unlock', async function () {
      const controller = createController()
      const first = connect(controller, 'https://a.test')
      const second = connect(controller, 'https://b.test')
      controller._onLock()
      for (const notifications of [first, second]) {
        assert.deepEqual(notifications, [{ jsonrpc: '2.0', method: 'metamask_accountsChanged', params: [] }])
      }
      let unlockEmitted = false
      controller.on('unlock', () => {
        unlockEmitted = true
      })
      controller._onUnlock()
      await new Promise((resolve) => setImmediate(resolve))
      assert.ok(unlockEmitted)
      assert.deepEqual(first.slice(1).map(({ method, params }) => [method, params]), [
        ['metamask_chainChanged', { chainId: '0x539', networkVersion: '1337', isConnected: true }],
        ['metamask_accountsChanged', [account]],
      ])
    })

    it('notifies each network change once', function () {
      const controller = createController()
      const notifications = connect(controller, 'https://a.test')
      const state = { network: '1337', provider: { type: 'rpc' } }
      controller._onStateUpdate(state)
      controller._onStateUpdate(state)
      controller.networkController.getChainId = () => '0x1'
      controller._onStateUpdate({ ...state, network: '1' })
      assert.deepEqual(notifications.map(({ params }) => params), [
        { chainId: '0x539', networkVersion: '1337', isConnected: true },
        { chainId: '0x1', networkVersion: '1', isConnected: true },
      ])
    })
  })

  describe('Provider state before the chain ID is known', function () {
    it('waits for the network to report a chain ID and sends no invalid updates', async function () {
      const controller = createController({ chainId: null })
      const notifications = connect(controller, 'https://a.test')
      controller._onStateUpdate({ network: 'loading', provider: { type: 'rpc' } })
      await controller._sendProviderState('https://a.test', controller.connections['https://a.test'][0].engine)
      assert.deepEqual(notifications.map(({ method }) => method), ['metamask_accountsChanged'])
      const pending = controller.getProviderState('https://a.test')
      controller.networkController.getChainId = () => '0x539'
      controller.emit('update', { network: '1337', provider: { type: 'rpc' } })
      assert.equal((await pending).chainId, '0x539')
    })
  })
})
