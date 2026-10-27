import log from 'loglevel';

import extension from './lib/extension-api';
import { createHardwareRequestHandler } from './lib/hardware-transport';

// Trezor Connect opens its popup from this tab, so the browser shows this tab
// when the popup closes, around when the response is sent. If that happens
// shortly after a response, bring back the wallet, where the result is shown.
const RETURN_TO_WALLET_MS = 5000;

const performRequest = createHardwareRequestHandler();
const backgroundUrls = new Set([
  extension.runtime.getURL('service-worker.js'),
  extension.runtime.getURL('_generated_background_page.html'),
]);
let returnToWalletUntil = 0;

async function returnToWallet() {
  const tab = await extension.tabs.getCurrent();
  // The wallet's URL carries its route in the fragment, so match the page.
  const walletUrl = extension.runtime.getURL('home.html');
  const wallet = (
    await extension.runtime.getContexts({ contextTypes: ['TAB'] })
  ).find(
    (context) =>
      context.windowId === tab.windowId &&
      context.documentUrl?.split('#')[0] === walletUrl,
  );
  if (wallet) {
    await extension.tabs.update(wallet.tabId, { active: true });
  }
}

function returnToWalletIfShown() {
  if (
    document.visibilityState === 'visible' &&
    Date.now() < returnToWalletUntil
  ) {
    returnToWalletUntil = 0;
    returnToWallet().catch((error) =>
      log.warn('Unable to return to the wallet tab', error),
    );
  }
}

document.addEventListener('visibilitychange', returnToWalletIfShown);

extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message?.type !== 'ecf-wallet-hardware-request' ||
    sender.id !== extension.runtime.id ||
    sender.tab ||
    !backgroundUrls.has(sender.url)
  ) {
    return false;
  }
  // Always respond: an unanswered request reaches the wallet only as Chrome's
  // "message channel closed" error. A response that cannot be sent (respond
  // throws) and a rejection that is not an Error both become error responses.
  performRequest(message)
    .then(respond)
    .catch((error) =>
      respond({
        error:
          (error && typeof error.message === 'string' && error.message) ||
          'Hardware wallet request failed. Please retry.',
      }),
    )
    .finally(() => {
      returnToWalletUntil = Date.now() + RETURN_TO_WALLET_MS;
      returnToWalletIfShown();
    });
  return true;
});
