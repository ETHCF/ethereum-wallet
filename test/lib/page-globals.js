import { webcrypto } from 'crypto';
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import path from 'path';
import proxyquire from 'proxyquire';

const ICON_PATH = '../../images/logo/ecf-wallet-icon.svg';

/**
 * Replaces the global window and document with a fresh page, for scripts that
 * read the page they run in, such as the content and inpage scripts.
 *
 * @param {string} html - The page's markup
 * @param {object} [options] - JSDOM options, such as url and contentType
 * @returns {Function} Restores the previous globals
 */
export function openPage(html, options = {}) {
  const previous = { window: global.window, document: global.document };
  const { window } = new JSDOM(html, {
    url: 'https://dapp.example/',
    ...options,
  });
  if (!window.crypto?.getRandomValues) {
    Object.defineProperty(window, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  }
  global.window = window;
  global.document = window.document;
  return () => {
    window.close();
    global.window = previous.window;
    global.document = previous.document;
  };
}

/**
 * Settles pending promise callbacks and timers.
 *
 * @returns {Promise<void>}
 */
export function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Loads the EIP-6963 announcer with its icon as text, as the build embeds it.
 *
 * @returns {Function} announceProvider
 */
export function loadAnnounceProvider() {
  const icon = readFileSync(
    path.join(__dirname, '../../app/scripts/lib', ICON_PATH),
    'utf8',
  );
  return proxyquire('../../app/scripts/lib/announce-provider', {
    [ICON_PATH]: { __esModule: true, default: icon, '@noCallThru': true },
  }).default;
}
