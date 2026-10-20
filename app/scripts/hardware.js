import extension from './lib/extension-api';
import { createHardwareRequestHandler } from './lib/hardware-transport';

const performRequest = createHardwareRequestHandler();
const backgroundUrls = new Set([
  extension.runtime.getURL('service-worker.js'),
  extension.runtime.getURL('_generated_background_page.html'),
]);

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
    );
  return true;
});
