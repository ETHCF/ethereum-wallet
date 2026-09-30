import { strict as assert } from 'assert'
import sinon from 'sinon'
import NotificationManager from '../../../app/scripts/lib/notification-manager'

describe('Notification popup placement', function () {
  let manager
  let platform
  const boundsError = new Error('Invalid value for bounds. Bounds must be at least 50% within visible screen space.')
  const options = { url: 'notification.html', type: 'popup', width: 360, height: 620 }

  beforeEach(function () {
    manager = new NotificationManager()
    platform = {
      getAllWindows: sinon.stub().resolves([]),
      getLastFocusedWindow: sinon.stub().resolves({ left: 100, top: 50, width: 1200 }),
      openWindow: sinon.stub().resolves({ id: 7, left: 940, top: 50 }),
      updateWindowPosition: sinon.stub().resolves(),
      focusWindow: sinon.stub().resolves(),
    }
    manager.platform = platform
  })

  it('positions the popup beside the last focused window', async function () {
    await manager.showPopup()
    assert.deepEqual(platform.openWindow.firstCall.args[0], { ...options, left: 940, top: 50 })
    assert.equal(manager._popupId, 7)
  })

  it('retries rejected bounds with browser-selected placement', async function () {
    platform.getLastFocusedWindow.resolves({ left: 4000, top: -2000, width: 1200 })
    platform.openWindow.onFirstCall().rejects(boundsError)
    await manager.showPopup()
    assert.equal(platform.openWindow.callCount, 2)
    assert.deepEqual(platform.openWindow.secondCall.args[0], options)
    assert.equal(platform.updateWindowPosition.callCount, 0)
    assert.equal(manager._popupId, 7)
  })

  it('honors a position corrected by the browser', async function () {
    platform.openWindow.resolves({ id: 7, left: 400, top: 10 })
    platform.updateWindowPosition.rejects(boundsError)
    await manager.showPopup()
    assert.equal(platform.updateWindowPosition.callCount, 0)
    assert.equal(manager._popupId, 7)
  })

  const unusableWindows = [undefined, {}, { left: NaN, top: 0, width: 1200 }, { left: -32000, top: -32000, width: 1200, state: 'minimized' }]
  unusableWindows.forEach((lastFocused) => {
    it(`uses browser placement for unusable window geometry: ${JSON.stringify(lastFocused)}`, async function () {
      platform.getLastFocusedWindow.resolves(lastFocused)
      await manager.showPopup()
      assert.deepEqual(platform.openWindow.firstCall.args[0], options)
      assert.equal(platform.updateWindowPosition.callCount, 0)
    })
  })

  it('uses browser placement when no last focused window is available', async function () {
    platform.getLastFocusedWindow.rejects(new Error('No current window'))
    await manager.showPopup()
    assert.deepEqual(platform.openWindow.firstCall.args[0], options)
  })

  it('preserves negative coordinates for monitors left of the primary monitor', async function () {
    platform.getLastFocusedWindow.resolves({ left: -1920, top: -100, width: 1920 })
    await manager.showPopup()
    assert.deepEqual(platform.openWindow.firstCall.args[0], { ...options, left: -360, top: -100 })
  })

  it('does not retry unrelated creation failures', async function () {
    const error = new Error('Window creation failed')
    platform.openWindow.rejects(error)
    await assert.rejects(manager.showPopup(), error)
    assert.equal(platform.openWindow.callCount, 1)
  })

  it('propagates fallback failure without repeatedly retrying', async function () {
    platform.openWindow.rejects(boundsError)
    await assert.rejects(manager.showPopup(), boundsError)
    assert.equal(platform.openWindow.callCount, 2)
  })

  it('focuses an existing popup without creating another', async function () {
    manager._popupId = 7
    platform.getAllWindows.resolves([{ id: 7, type: 'popup' }])
    await manager.showPopup()
    assert.deepEqual(platform.focusWindow.firstCall.args, [7])
    assert.equal(platform.openWindow.callCount, 0)
  })
})
