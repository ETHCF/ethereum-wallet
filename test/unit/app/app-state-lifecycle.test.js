import { strict as assert } from 'assert'
import sinon from 'sinon'
import ObservableStore from 'obs-store'
import AppStateController from '../../../app/scripts/controllers/app-state'

describe('Manifest V3 auto-lock deadlines', function () {
  let clock

  beforeEach(function () {
    clock = sinon.useFakeTimers({ now: 1000000 })
  })

  afterEach(function () {
    clock.restore()
  })

  function createController (lastActiveTime, onInactiveTimeout) {
    return new AppStateController({
      initState: { lastActiveTime },
      preferencesStore: new ObservableStore({ preferences: { autoLockTimeLimit: 1 } }),
      addUnlockListener: () => undefined,
      onInactiveTimeout,
    })
  }

  it('retains the remaining deadline after restarting the controller', function () {
    const lock = sinon.spy()
    const controller = createController(Date.now() - 50000, lock)
    assert.equal(controller.store.getState().lastActiveTime, 950000)
    clock.tick(9999)
    assert.equal(lock.callCount, 0)
    clock.tick(1)
    assert.equal(lock.callCount, 1)
  })

  it('locks immediately for an expired deadline', function () {
    const lock = sinon.spy()
    createController(Date.now() - 60001, lock)
    clock.tick(0)
    assert.equal(lock.callCount, 1)
  })

  it('persists activity and replaces the previous deadline', function () {
    const lock = sinon.spy()
    const controller = createController(Date.now() - 50000, lock)
    controller.setLastActiveTime()
    assert.equal(controller.store.getState().lastActiveTime, Date.now())
    clock.tick(59999)
    assert.equal(lock.callCount, 0)
    clock.tick(1)
    assert.equal(lock.callCount, 1)
  })
})
