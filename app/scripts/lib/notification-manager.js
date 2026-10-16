import EventEmitter from 'events';

import extension from './extension-api';
import ExtensionPlatform from '../platforms/extension';

const NOTIFICATION_HEIGHT = 620;
const NOTIFICATION_WIDTH = 360;

export const POPUP_CLOSED = 'popup-closed';

export default class NotificationManager extends EventEmitter {
  /**
   * A collection of methods for controlling the showing and hiding of the notification popup.
   *
   * @typedef {object} NotificationManager
   * @property {ExtensionPlatform} platform - Opens and focuses browser windows.
   */

  constructor() {
    super();
    this.platform = new ExtensionPlatform();
    this._popupAutomaticallyClosed = false;
    extension.windows?.onRemoved.addListener((windowId) =>
      this.onWindowRemoved(windowId),
    );
  }

  /**
   * Records that the wallet, not the user, is closing the notification
   * window, as it does once nothing is left to approve.
   */
  markAsAutomaticallyClosed() {
    this._popupAutomaticallyClosed = true;
  }

  /**
   * Emits POPUP_CLOSED, with whether the wallet closed it, when the
   * notification window is closed.
   *
   * @param {number} windowId - The closed window.
   */
  onWindowRemoved(windowId) {
    if (this._popupId === undefined || windowId !== this._popupId) {
      return;
    }
    const automaticallyClosed = this._popupAutomaticallyClosed;
    this._popupId = undefined;
    this._popupAutomaticallyClosed = false;
    this.emit(POPUP_CLOSED, { automaticallyClosed });
  }

  /**
   * Either brings an existing ecf-wallet notification window into focus, or creates a new notification window. New
   * notification windows are given a 'popup' type.
   *
   * @returns {Promise<void>} Resolves once the popup is shown.
   */
  showPopup() {
    if (!this._showingPopup) {
      this._showingPopup = this._showPopup().finally(() => {
        this._showingPopup = null;
      });
    }
    return this._showingPopup;
  }

  async _showPopup() {
    const popup = await this._getPopup();

    // Bring focus to chrome popup
    if (popup) {
      // bring focus to existing chrome popup
      this._popupId = popup.id;
      await this.platform.focusWindow(popup.id);
    } else {
      let position = {};
      try {
        const lastFocused = await this.platform.getLastFocusedWindow();
        // Position window in top right corner of lastFocused window.
        if (
          lastFocused &&
          lastFocused.state !== 'minimized' &&
          [lastFocused.top, lastFocused.left, lastFocused.width].every(
            Number.isFinite,
          )
        ) {
          position = {
            top: lastFocused.top,
            left: lastFocused.left + (lastFocused.width - NOTIFICATION_WIDTH),
          };
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
      };
      let popupWindow;
      try {
        popupWindow = await this.platform.openWindow({
          ...options,
          ...position,
        });
      } catch (error) {
        if (
          position.left === undefined ||
          !error.message?.includes('Invalid value for bounds')
        ) {
          throw error;
        }
        // The last focused window may be off-screen or on a removed monitor.
        popupWindow = await this.platform.openWindow(options);
      }
      // Honor browser-adjusted placement instead of forcing rejected coordinates.
      this._popupId = popupWindow.id;
      this._popupAutomaticallyClosed = false;
    }
  }

  /**
   * Checks all open ecf-wallet windows, and returns the first one it finds that is a notification window (i.e. has the
   * type 'popup')
   *
   * @private
   * @returns {Promise<object|null|undefined>} The notification window, if one is open.
   */
  async _getPopup() {
    const windows = await this.platform.getAllWindows();
    return this._getPopupIn(windows);
  }

  /**
   * Given an array of windows, returns the 'popup' that has been opened by ecf-wallet, or null if no such window exists.
   *
   * @private
   * @param {Array} windows - An array of objects containing data about the open ecf-wallet extension windows.
   * @returns {object|null|undefined} The notification window, undefined if there is none, or null if `windows` is missing.
   */
  _getPopupIn(windows) {
    return windows
      ? windows.find((win) => {
          // Returns notification popup
          return (
            win &&
            win.type === 'popup' &&
            (win.id === this._popupId ||
              win.tabs?.some((tab) =>
                tab.url?.startsWith(
                  extension.runtime.getURL('notification.html'),
                ),
              ))
          );
        })
      : null;
  }
}
