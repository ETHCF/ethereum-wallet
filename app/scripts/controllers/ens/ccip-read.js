import browserGlobal from '../../lib/browser-global';
import extension from '../../lib/extension-api';
import {
  isLocalHostname,
  readAtMost,
  resolvesToLocal,
} from '../../lib/remote-image';

// EIP-3668 (CCIP-read) gateway requests. The resolver contract chooses the
// gateways, so each request is treated as going to an unknown third party:
// https only, no credentials or referrer, no redirects, and bounded in time,
// size and number.

// Gateways tried for one offchain lookup, however many the contract lists.
export const MAX_GATEWAY_ATTEMPTS = 3;
// A gateway's answer is call data, sometimes with a storage proof.
export const MAX_GATEWAY_RESPONSE_BYTES = 256 * 1024;
// Call data sent to a gateway. GET puts it in the URL.
export const MAX_GATEWAY_CALL_DATA_BYTES = 16 * 1024;
// Covers the whole request, including reading the answer.
export const GATEWAY_TIMEOUT_MS = 10000;

const HEX_DATA = /^0x(?:[0-9a-f]{2})*$/iu;

/**
 * An offchain lookup that did not give an answer.
 *
 * @param {string} message - What went wrong
 * @returns {Error} An error with the code 'offchainLookupFailed'
 */
export function offchainLookupFailed(message) {
  return Object.assign(new Error(`ENS offchain lookup failed: ${message}`), {
    code: 'offchainLookupFailed',
  });
}

/**
 * Builds the URL for one gateway from its template, if the gateway may be
 * contacted: an https URL with no credentials, on a host that is not on this
 * computer or the local network.
 *
 * @param {unknown} template - A gateway URL template from the contract
 * @param {string} sender - The contract, as lowercase hex
 * @param {string} callData - The call data, as lowercase hex
 * @returns {{url: URL, isGet: boolean} | undefined} The URL and whether it is
 * requested with GET (the template includes {data}) or POST
 */
export function gatewayRequestUrl(template, sender, callData) {
  if (typeof template !== 'string') {
    return undefined;
  }
  const isGet = template.includes('{data}');
  let url;
  try {
    url = new URL(
      template
        .replace(/\{sender\}/gu, () => sender)
        .replace(/\{data\}/gu, () => callData),
    );
  } catch (_) {
    return undefined;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    isLocalHostname(url.hostname)
  ) {
    return undefined;
  }
  return { url, isGet };
}

async function requestGateway({ url, isGet }, body, { fetch, dns }) {
  // Resolved just before the request, so the request uses the same answer.
  if (await resolvesToLocal(url.hostname, dns)) {
    return { skip: true };
  }
  const abortController = new browserGlobal.AbortController();
  const timer = setTimeout(() => abortController.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      method: isGet ? 'GET' : 'POST',
      ...(isGet
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      // A redirect could lead to a local host or a plain http one.
      redirect: 'error',
      signal: abortController.signal,
    });
    // EIP-3668: a 4xx answer is final, while other gateways may still
    // answer after a server error.
    if (response.status >= 400 && response.status < 500) {
      return { fatal: true };
    }
    if (
      !response.ok ||
      Number(response.headers?.get?.('content-length')) >
        MAX_GATEWAY_RESPONSE_BYTES
    ) {
      return { skip: true };
    }
    const bytes = await readAtMost(response, MAX_GATEWAY_RESPONSE_BYTES);
    if (!bytes) {
      return { skip: true };
    }
    const { data } = JSON.parse(new TextDecoder().decode(bytes)) ?? {};
    return typeof data === 'string' && HEX_DATA.test(data)
      ? { data: data.toLowerCase() }
      : { skip: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the gateways an OffchainLookup names for the answer to its call data,
 * trying them in order until one answers.
 *
 * @param {object} lookup - The OffchainLookup
 * @param {string[]} lookup.urls - The gateway URL templates
 * @param {string} lookup.sender - The contract that reverted
 * @param {string} lookup.callData - The call data to send
 * @param {object} [options] - Options
 * @param {Function} [options.fetch] - The fetch function to use
 * @param {object} [options.dns] - The extension DNS API, if there is one
 * @returns {Promise<string>} The answer, as 0x-prefixed hex
 */
export async function fetchOffchainData(
  { urls, sender, callData },
  {
    fetch = (...args) => browserGlobal.fetch(...args),
    dns = extension.dns,
  } = {},
) {
  if (!Array.isArray(urls)) {
    throw offchainLookupFailed('no gateways');
  }
  if ((callData.length - 2) / 2 > MAX_GATEWAY_CALL_DATA_BYTES) {
    throw offchainLookupFailed('call data too large');
  }
  const body = { data: callData.toLowerCase(), sender: sender.toLowerCase() };
  const requests = urls
    .map((template) => gatewayRequestUrl(template, body.sender, body.data))
    .filter(Boolean)
    .slice(0, MAX_GATEWAY_ATTEMPTS);
  if (!requests.length) {
    throw offchainLookupFailed('no usable https gateway');
  }
  // Gateways are tried one at a time, in the contract's order.
  const tryFrom = async (index) => {
    if (index >= requests.length) {
      throw offchainLookupFailed('no gateway answered');
    }
    let result;
    try {
      result = await requestGateway(requests[index], body, { fetch, dns });
    } catch (_) {
      result = { skip: true };
    }
    if (result.data) {
      return result.data;
    }
    if (result.fatal) {
      throw offchainLookupFailed('the gateway refused the request');
    }
    return tryFrom(index + 1);
  };
  return tryFrom(0);
}
