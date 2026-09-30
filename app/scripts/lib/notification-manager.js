import extension from 'extensionizer'
import ExtensionPlatform from '../platforms/extension'

const NOTIFICATION_HEIGHT = 620
const NOTIFICATION_WIDTH = 360

export default class NotificationManager {

  /**
   * A collection of methods for controlling the showing and hiding of the notification popup.
   *
   * @typedef {Object} NotificationManager
   *
   */

  constructor () {
    this.platform = new ExtensionPlatform()
  }

  /**
   * Either brings an existing ecf-wallet notification window into focus, or creates a new notification window. New
   * notification windows are given a 'popup' type.
   *
   */
  async showPopup () {
    const popup = await this._getPopup()

    // Bring focus to chrome popup
    if (popup) {
      // bring focus to existing chrome popup
      await this.platform.focusWindow(popup.id)
    } else {
      let left = 0
      let top = 0
      try {
        const lastFocused = await this.platform.getLastFocusedWindow()
        // Position window in top right corner of lastFocused window.
        top = lastFocused.top
        left = lastFocused.left + (lastFocused.width - NOTIFICATION_WIDTH)
      } catch (_) {
        // A worker has no screen or window dimensions.
        top = 0
        left = 0
      }

      // create new notification popup
      const popupWindow = await this.platform.openWindow({
        url: 'notification.html',
        type: 'popup',
        width: NOTIFICATION_WIDTH,
        height: NOTIFICATION_HEIGHT,
        left,
        top,
      })

      // Firefox currently ignores left/top for create, but it works for update
      if (popupWindow.left !== left && popupWindow.state !== 'fullscreen') {
        await this.platform.updateWindowPosition(popupWindow.id, left, top)
      }
      this._popupId = popupWindow.id
    }
  }

  /**
   * Checks all open ecf-wallet windows, and returns the first one it finds that is a notification window (i.e. has the
   * type 'popup')
   *
   * @private
   * @param {Function} cb - A node style callback that to which the found notification window will be passed.
   *
   */
  async _getPopup () {
    const windows = await this.platform.getAllWindows()
    return this._getPopupIn(windows)
  }

  /**
   * Given an array of windows, returns the 'popup' that has been opened by ecf-wallet, or null if no such window exists.
   *
   * @private
   * @param {array} windows - An array of objects containing data about the open ecf-wallet extension windows.
   *
   */
  _getPopupIn (windows) {
    return windows ? windows.find((win) => {
      // Returns notification popup
      return win && win.type === 'popup' && (win.id === this._popupId ||
        win.tabs?.some((tab) => tab.url?.startsWith(extension.runtime.getURL('notification.html'))))
    }) : null
  }

}
