import log from 'loglevel';

import extension from './lib/extension-api';
import { createHardwareRequestHandler } from './lib/hardware-transport';

// Trezor Connect opens its popup from this tab, so the browser shows this tab
// when the popup closes, just before or after the response is sent. When that
// happens, go back to the tab the user was on when the request arrived.
const RETURN_AFTER_RESPONSE_MS = 5000;

const performRequest = createHardwareRequestHandler();
const backgroundUrls = new Set([
  extension.runtime.getURL('service-worker.js'),
  extension.runtime.getURL('_generated_background_page.html'),
]);
const thisTab = extension.tabs.getCurrent();
let pendingRequests = 0;
let returnTabId;
let returnUntil = 0;

// Only the tab's ID is read: without the tabs permission it carries no URL.
async function rememberActiveTab() {
  const { id, windowId } = await thisTab;
  const [active] = await extension.tabs.query({ active: true, windowId });
  returnTabId = active && active.id !== id ? active.id : undefined;
}

async function findWalletTab() {
  const { windowId } = await thisTab;
  // The wallet's URL carries its route in the fragment, so match the page.
  const walletUrl = extension.runtime.getURL('home.html');
  const wallets = (
    await extension.runtime.getContexts({ contextTypes: ['TAB'] })
  ).filter(
    (context) =>
      context.windowId === windowId &&
      context.documentUrl?.split('#')[0] === walletUrl,
  );
  return (
    wallets.find((context) =>
      context.documentUrl.includes('#/new-account/connect'),
    ) || wallets[0]
  )?.tabId;
}

async function returnToPreviousTab() {
  const tabId = returnTabId;
  returnTabId = undefined;
  if (tabId !== undefined) {
    try {
      await extension.tabs.update(tabId, { active: true });
      return;
    } catch (error) {
      // The tab was closed during the request: fall back to the wallet.
    }
  }
  const walletTabId = await findWalletTab();
  if (walletTabId !== undefined) {
    await extension.tabs.update(walletTabId, { active: true });
  }
}

function returnIfShown() {
  if (
    document.visibilityState !== 'visible' ||
    pendingRequests ||
    Date.now() >= returnUntil
  ) {
    return;
  }
  returnUntil = 0;
  returnToPreviousTab().catch((error) =>
    log.warn('Unable to return from the hardware wallet tab', error),
  );
}

document.addEventListener('visibilitychange', returnIfShown);

extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message?.type !== 'ecf-wallet-hardware-request' ||
    sender.id !== extension.runtime.id ||
    sender.tab ||
    !backgroundUrls.has(sender.url)
  ) {
    return false;
  }
  pendingRequests += 1;
  // Remember the tab before the request can open a popup that changes it.
  rememberActiveTab()
    .catch((error) => log.warn('Unable to read the active tab', error))
    .then(() => performRequest(message))
    // Always respond: an unanswered request reaches the wallet only as
    // Chrome's "message channel closed" error. A response that cannot be sent
    // (respond throws) and a rejection that is not an Error both become error
    // responses.
    .then(respond)
    .catch((error) =>
      respond({
        error:
          (error && typeof error.message === 'string' && error.message) ||
          'Hardware wallet request failed. Please retry.',
      }),
    )
    .finally(() => {
      pendingRequests -= 1;
      returnUntil = Date.now() + RETURN_AFTER_RESPONSE_MS;
      returnIfShown();
    });
  return true;
});
