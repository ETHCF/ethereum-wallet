import log from 'loglevel';
import punycode from 'punycode';

import browserGlobal from '../browser-global';
import extension from '../extension-api';
import resolveEnsToIpfsContentId from './resolver';

// The form each kind of content hash must take before it goes into a URL. A
// name's owner chooses its content hash, and for some kinds the decoded hash
// is any text they like, so it is never put into a URL unchecked.
const CONTENT_HASH_FORMATS = {
  // Base32 CIDv1, which must be a single DNS label of the gateway's host.
  'ipfs-ns': /^[a-z0-9]+$/u,
  'ipns-ns': /^[a-z0-9]+$/u,
  // Tor onion service addresses, version 2 and version 3.
  onion: /^[a-z2-7]{16}$/u,
  onion3: /^[a-z2-7]{56}$/u,
  // A ZeroNet site address, which is a base58 Bitcoin address.
  zeronet: /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/u,
};

/**
 * Whether a resolved content hash is a well-formed address of its kind.
 *
 * @param {string} type - The content hash's codec, such as ipfs-ns.
 * @param {unknown} hash - The decoded content hash.
 * @returns {boolean} Whether it may be put into a URL.
 */
export function isValidContentHash(type, hash) {
  const format = CONTENT_HASH_FORMATS[type];
  return Boolean(format) && typeof hash === 'string' && format.test(hash);
}

/**
 * Reads what the user typed after the address bar keyword, such as
 * `vitalik.eth/blog?x#y` or just `vitalik`, as a .eth name and the rest of
 * the address.
 *
 * @param {string} text - The text the user entered.
 * @returns {object|null} The name (in Unicode, as ENS names are hashed) and
 * the path, query and fragment; or null if the text is not a .eth address.
 */
export function parseEnsInput(text) {
  const address = String(text)
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '');
  if (!address || /\s/u.test(address)) {
    return null;
  }
  let url;
  try {
    url = new URL(`https://${address}`);
  } catch (_) {
    return null;
  }
  if (url.username || url.password || url.port) {
    return null;
  }
  let { hostname } = url;
  if (!hostname.includes('.')) {
    hostname = `${hostname}.eth`;
  }
  if (!hostname.endsWith('.eth') || hostname === '.eth') {
    return null;
  }
  return {
    name: punycode.toUnicode(hostname),
    hostname,
    path: url.pathname,
    search: url.search,
    fragment: url.hash,
  };
}

/**
 * Opens ENS websites the user asks for through the address bar keyword. The
 * wallet does not watch page loads: a name is resolved only when the user
 * enters it after the keyword.
 *
 * @param {object} opts - Options.
 * @param {object} opts.provider - The wallet's provider, used to look up
 * the name.
 * @param {Function} opts.getIpfsGateway - Returns the IPFS gateway's host.
 * @returns {{ open: Function }} Opens what the user entered.
 */
export default function setupEnsIpfsResolver({ provider, getIpfsGateway }) {
  return { open };

  /**
   * Resolves an entered .eth address and shows its site.
   *
   * @param {string} text - What the user entered after the keyword.
   * @param {string} disposition - The omnibox disposition: currentTab,
   * newForegroundTab or newBackgroundTab.
   */
  async function open(text, disposition) {
    const input = parseEnsInput(text);
    if (!input) {
      return;
    }
    const tabId = await openLoadingTab(disposition);
    const url = await resolveUrl(input);
    await extension.tabs.update(tabId, { url }).catch(() => undefined);
  }

  async function openLoadingTab(disposition) {
    if (disposition === 'currentTab') {
      const [tab] = await extension.tabs.query({
        active: true,
        currentWindow: true,
      });
      await extension.tabs
        .update(tab.id, { url: 'loading.html' })
        .catch(() => undefined);
      return tab.id;
    }
    const tab = await extension.tabs.create({
      url: 'loading.html',
      active: disposition !== 'newBackgroundTab',
    });
    return tab.id;
  }

  async function resolveUrl({ name, hostname, path, search, fragment }) {
    const rest = `${path}${search}${fragment}`;
    const fallback = `https://app.ens.domains/name/${hostname}`;
    try {
      const { type, hash } = await resolveEnsToIpfsContentId({
        provider,
        name,
      });
      if (!isValidContentHash(type, hash)) {
        // Not a well-formed address of its kind: show the name on the ENS
        // app instead.
        return fallback;
      }
      if (type === 'ipfs-ns' || type === 'ipns-ns') {
        const resolvedUrl = `https://${hash}.${type.slice(0, 4)}.${getIpfsGateway()}${rest}`;
        // Check that the gateway has the content.
        const response = await browserGlobal.fetch(resolvedUrl, {
          method: 'HEAD',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        return response.status === 200 ? resolvedUrl : fallback;
      }
      if (type === 'onion' || type === 'onion3') {
        return `http://${hash}.onion${rest}`;
      }
      if (type === 'zeronet') {
        return `http://127.0.0.1:43110/${hash}${rest}`;
      }
    } catch (err) {
      log.warn(err);
    }
    return fallback;
  }
}
