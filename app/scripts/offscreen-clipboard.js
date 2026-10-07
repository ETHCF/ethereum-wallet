/* global chrome */
import { clearClipboardInDocument } from './lib/clear-clipboard';

// Runs in an offscreen document, which may use the clipboard while the
// service worker cannot. Replaces the clipboard contents with an empty string.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message?.type !== 'ecf-wallet-clear-clipboard' ||
    sender.id !== chrome.runtime.id
  ) {
    return;
  }
  respond(clearClipboardInDocument(document));
});
