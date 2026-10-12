import browserGlobal from '../browser-global';
import extension from '../extension-api';
import resolveEnsToIpfsContentId from './resolver';

const supportedTopLevelDomains = ['eth'];

// The form each kind of content hash must take before it goes into a URL. A
// name's owner chooses its content hash, and for some kinds the decoded hash
// is any text they like, so it is never put into a URL unchecked.
const CONTENT_HASH_FORMATS = {
  // Base32 CIDv1, which must be a single DNS label of the gateway's host.
  'ipfs-ns': /^[a-z0-9]+$/u,
  'ipns-ns': /^[a-z0-9]+$/u,
  // A plain or an encrypted Swarm reference.
  'swarm-ns': /^(?:[0-9a-f]{64}|[0-9a-f]{128})$/u,
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

export default function setupEnsIpfsResolver({
  provider,
  getCurrentNetwork,
  getIpfsGateway,
}) {
  // The background entry point registers this listener synchronously so it can
  // wake a suspended service worker.
  return {
    handleRequest: webRequestDidFail,
  };

  async function webRequestDidFail(details) {
    const { tabId, url } = details;
    // ignore requests that are not associated with tabs
    // only attempt ENS resolution on mainnet
    if (tabId === -1 || getCurrentNetwork() !== '1') {
      return;
    }
    // parse ens name
    const {
      hostname: name,
      pathname: path,
      search,
      hash: fragment,
    } = new URL(url);
    const domainParts = name.split('.');
    const topLevelDomain = domainParts[domainParts.length - 1];
    // if unsupported TLD, abort
    if (!supportedTopLevelDomains.includes(topLevelDomain)) {
      return;
    }
    // otherwise attempt resolve
    attemptResolve({ tabId, name, path, search, fragment });
  }

  async function attemptResolve({ tabId, name, path, search, fragment }) {
    const ipfsGateway = getIpfsGateway();
    extension.tabs
      .update(tabId, { url: `loading.html` })
      .catch(() => undefined);
    let url = `https://app.ens.domains/name/${name}`;
    try {
      const { type, hash } = await resolveEnsToIpfsContentId({
        provider,
        name,
      });
      if (!isValidContentHash(type, hash)) {
        // Not a well-formed address of its kind: show the name on the ENS
        // app instead.
        return;
      }
      if (type === 'ipfs-ns' || type === 'ipns-ns') {
        const resolvedUrl = `https://${hash}.${type.slice(0, 4)}.${ipfsGateway}${path}${search || ''}${fragment || ''}`;
        try {
          // check if ipfs gateway has result
          const response = await browserGlobal.fetch(resolvedUrl, {
            method: 'HEAD',
          });
          if (response.status === 200) {
            url = resolvedUrl;
          }
        } catch (err) {
          console.warn(err);
        }
      } else if (type === 'swarm-ns') {
        url = `https://swarm-gateways.net/bzz:/${hash}${path}${search || ''}${fragment || ''}`;
      } else if (type === 'onion' || type === 'onion3') {
        url = `http://${hash}.onion${path}${search || ''}${fragment || ''}`;
      } else if (type === 'zeronet') {
        url = `http://127.0.0.1:43110/${hash}${path}${search || ''}${fragment || ''}`;
      }
    } catch (err) {
      console.warn(err);
    } finally {
      extension.tabs.update(tabId, { url }).catch(() => undefined);
    }
  }
}
