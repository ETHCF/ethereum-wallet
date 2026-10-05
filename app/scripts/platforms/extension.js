import { getTxExplorerUrl } from '../lib/block-explorer';
import { ENVIRONMENT_TYPE_BACKGROUND } from '../lib/enums';
import extension from '../lib/extension-api';
import { getEnvironmentType } from '../lib/util';

export default class ExtensionPlatform {
  //
  // Public
  //
  reload() {
    extension.runtime.reload();
  }

  openTab(options) {
    return extension.tabs.create(options);
  }

  openWindow(options) {
    return extension.windows.create(options);
  }

  async focusWindow(windowId) {
    await extension.windows.update(windowId, { focused: true });
  }

  async updateWindowPosition(windowId, left, top) {
    await extension.windows.update(windowId, { left, top });
  }

  getLastFocusedWindow() {
    return extension.windows.getLastFocused();
  }

  async closeCurrentWindow() {
    const windowDetails = await extension.windows.getCurrent();
    await extension.windows.remove(windowDetails.id);
  }

  getVersion() {
    return extension.runtime.getManifest().version;
  }

  openExtensionInBrowser(route = null, queryString = null) {
    let extensionURL = extension.runtime.getURL('home.html');

    if (queryString) {
      extensionURL += `?${queryString}`;
    }

    if (route) {
      extensionURL += `#${route}`;
    }
    this.openTab({ url: extensionURL });
    if (getEnvironmentType() !== ENVIRONMENT_TYPE_BACKGROUND) {
      window.close();
    }
  }

  getPlatformInfo(cb) {
    // eslint-disable-next-line promise/catch-or-return -- callback API: cb is the rejection handler
    extension.runtime
      .getPlatformInfo()
      // eslint-disable-next-line promise/no-callback-in-promise -- callback API: the result is delivered through cb
      .then((platform) => cb(null, platform), cb);
  }

  showTransactionNotification(txMeta) {
    const { status, txReceipt: { status: receiptStatus } = {} } = txMeta;

    if (status === 'confirmed') {
      // There was an on-chain failure
      receiptStatus === '0x0'
        ? this._showFailedTransaction(
            txMeta,
            'Transaction encountered an error.',
          )
        : this._showConfirmedTransaction(txMeta);
    } else if (status === 'failed') {
      this._showFailedTransaction(txMeta);
    }
  }

  getAllWindows() {
    return extension.windows.getAll({ populate: true });
  }

  getActiveTabsInLastFocusedWindow() {
    return extension.tabs.query({ active: true, lastFocusedWindow: true });
  }

  currentTab() {
    return extension.tabs.getCurrent();
  }

  switchToTab(tabId) {
    return extension.tabs.update(tabId, { highlighted: true });
  }

  async closeTab(tabId) {
    await extension.tabs.remove(tabId);
  }

  _showConfirmedTransaction(txMeta) {
    this._subscribeToNotificationClicked();

    const url = getTxExplorerUrl(txMeta.hash, txMeta.ecfWalletNetworkId);
    const nonce = parseInt(txMeta.txParams.nonce, 16);

    const title = 'Confirmed transaction';
    const message = url
      ? `Transaction ${nonce} confirmed! View in block explorer`
      : `Transaction ${nonce} confirmed!`;
    this._showNotification(title, message, url);
  }

  _showFailedTransaction(txMeta, errorMessage) {
    const nonce = parseInt(txMeta.txParams.nonce, 16);
    const title = 'Failed transaction';
    const message = `Transaction ${nonce} failed! ${errorMessage || txMeta.err.message}`;
    this._showNotification(title, message);
  }

  _showNotification(title, message, url) {
    extension.notifications.create(url, {
      type: 'basic',
      title,
      iconUrl: extension.runtime.getURL('images/icon-64.png'),
      message,
    });
  }

  _subscribeToNotificationClicked() {
    if (!extension.notifications.onClicked.hasListener(this._viewOnEtherscan)) {
      extension.notifications.onClicked.addListener(this._viewOnEtherscan);
    }
  }

  _viewOnEtherscan(txId) {
    if (txId.startsWith('https://')) {
      extension.tabs.create({ url: txId }).catch(() => undefined);
    }
  }
}
