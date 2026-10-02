import ExtensionPlatform from '../platforms/extension'
import extension from './extension-api'

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
  showPopup () {
    if (!this._showingPopup) {
      this._showingPopup = this._showPopup().finally(() => {
        this._showingPopup = null
      })
    }
    return this._showingPopup
  }

  async _showPopup () {
    const popup = await this._getPopup()

    // Bring focus to chrome popup
    if (popup) {
      // bring focus to existing chrome popup
      await this.platform.focusWindow(popup.id)
    } else {
      let position = {}
      try {
        const lastFocused = await this.platform.getLastFocusedWindow()
        // Position window in top right corner of lastFocused window.
        if (lastFocused && lastFocused.state !== 'minimized' &&
            [lastFocused.top, lastFocused.left, lastFocused.width].every(Number.isFinite)) {
          position = {
            top: lastFocused.top,
            left: lastFocused.left + (lastFocused.width - NOTIFICATION_WIDTH),
          }
        }
      } catch (_) {
        // A worker has no screen dimensions; let the browser choose placement.
      }

      // create new notification popup
      const options = {
        url: 'notification.html',
        type: 'popup',
        width: NOTIFICATION_WIDTH,
        height: NOTIFICATION_HEIGHT,
      }
      let popupWindow
      try {
        popupWindow = await this.platform.openWindow({ ...options, ...position })
      } catch (error) {
        if (position.left === undefined || !error.message?.includes('Invalid value for bounds')) {
          throw error
        }
        // The last focused window may be off-screen or on a removed monitor.
        popupWindow = await this.platform.openWindow(options)
      }
      // Honor browser-adjusted placement instead of forcing rejected coordinates.
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
