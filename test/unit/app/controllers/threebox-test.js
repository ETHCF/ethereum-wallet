import { strict as assert } from 'assert'
import sinon from 'sinon'
import ObservableStore from 'obs-store'
import ThreeBoxController from '../../../../app/scripts/controllers/threebox'
import Migrator from '../../../../app/scripts/lib/migrator'
import migrations from '../../../../app/scripts/migrations'

describe('3Box backup schema', function () {
  let controller
  let storedBackup
  const preferences = { selectedAddress: '0x123', currentLocale: 'en' }
  const addressBook = { addressBook: { 1: { '0x456': { name: 'Recipient' } } } }

  beforeEach(function () {
    storedBackup = undefined
    controller = Object.create(ThreeBoxController.prototype)
    controller.migrator = new Migrator({ migrations })
    controller.store = new ObservableStore({
      threeBoxSyncingAllowed: true,
      threeBoxSynced: true,
      showRestorePrompt: true,
    })
    controller.preferencesController = {
      store: new ObservableStore(preferences),
    }
    controller.addressBookController = { state: addressBook, update: sinon.spy() }
    controller.space = {
      private: {
        async set (key, value) {
          assert.equal(key, 'ecfWalletBackup')
          storedBackup = value
        },
        async get (key) {
          assert.equal(key, 'ecfWalletBackup')
          return storedBackup
        },
      },
    }
  })

  it('round-trips a current-schema backup without requiring a historical migration', async function () {
    await controller._update3Box()
    const backup = JSON.parse(storedBackup)
    assert.deepEqual(backup.meta, { version: 0 })
    assert.deepEqual(backup.data, {
      PreferencesController: preferences,
      AddressBookController: addressBook,
    })
    assert.equal(typeof backup.lastUpdated, 'number')
    assert.equal(await controller.getLastUpdated(), backup.lastUpdated)
    controller.preferencesController.store.putState({})

    await controller.restoreFromThreeBox()

    assert.deepEqual(controller.preferencesController.store.getState(), preferences)
    assert.ok(controller.addressBookController.update.calledOnceWithExactly(addressBook, true))
    assert.equal(controller.store.getState().threeBoxLastUpdated, backup.lastUpdated)
    assert.equal(controller.store.getState().showRestorePrompt, false)
  })

  it('uses the saved version when applying future migrations to a backup', async function () {
    await controller._update3Box()
    controller.migrator = new Migrator({
      migrations: [{
        version: 1,
        async migrate (state) {
          assert.equal(state.meta.version, 0)
          return {
            ...state,
            meta: { version: 1 },
            data: {
              ...state.data,
              PreferencesController: { ...state.data.PreferencesController, currentLocale: 'fr' },
            },
          }
        },
      }],
    })

    await controller.restoreFromThreeBox()

    assert.equal(controller.preferencesController.store.getState().currentLocale, 'fr')
  })
})
