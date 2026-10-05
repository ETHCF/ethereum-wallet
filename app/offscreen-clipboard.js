/* global chrome */
/* eslint-disable import-x/unambiguous */
// Runs in an offscreen document, which may use the clipboard while the
// service worker cannot. Replaces the clipboard contents with an empty string.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    message?.type !== 'ecf-wallet-clear-clipboard' ||
    sender.id !== chrome.runtime.id
  ) {
    return;
  }
  const replace = (event) => {
    event.clipboardData.setData('text/plain', '');
    event.preventDefault();
  };
  document.addEventListener('copy', replace);
  try {
    respond(document.execCommand('copy'));
  } finally {
    document.removeEventListener('copy', replace);
  }
});
