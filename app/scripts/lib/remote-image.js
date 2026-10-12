import extension from './extension-api';
import fetchWithTimeout from './fetch-with-timeout';

// Site icons and token images are small. A larger answer is not an icon.
export const MAX_IMAGE_BYTES = 64 * 1024;

// Types an <img> shows. SVG is safe there: an image runs no script.
const IMAGE_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
]);

const fetchImage = fetchWithTimeout({ timeout: 10000 });

// A failed download is tried once more after this long, and then given up.
const RETRY_DELAY_MS = 2000;

function parseIPv4(text) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(text);
  if (!match) {
    return undefined;
  }
  const bytes = match.slice(1).map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : undefined;
}

// The eight 16-bit groups of an IPv6 address, or undefined if it is not one.
function parseIPv6(text) {
  let rest = text.replace(/^\[|\]$/gu, '').replace(/%.*$/u, '');
  const tail = [];
  const v4 = /:(\d+\.\d+\.\d+\.\d+)$/u.exec(rest);
  if (v4) {
    const bytes = parseIPv4(v4[1]);
    if (!bytes) {
      return undefined;
    }
    tail.push(bytes[0] * 256 + bytes[1], bytes[2] * 256 + bytes[3]);
    rest = `${rest.slice(0, v4.index)}:0:0`;
  }
  const halves = rest.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  const toGroups = (half) => (half ? half.split(':') : []);
  const head = toGroups(halves[0]);
  const end = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - end.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return undefined;
  }
  const groups = [...head, ...Array(missing).fill('0'), ...end];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/iu.test(group))) {
    return undefined;
  }
  const numbers = groups.map((group) => parseInt(group, 16));
  if (tail.length) {
    numbers.splice(6, 2, ...tail);
  }
  return numbers;
}

// Whether an IPv4 address, as four bytes, is on this computer or the local
// network: this network (0/8), private (10/8, 172.16/12, 192.168/16), shared
// carrier NAT (100.64/10), loopback (127/8), link-local (169.254/16), and
// multicast, reserved and broadcast (224/3).
function isLocalIPv4([a, b]) {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// The four bytes of an IPv4 address carried in two IPv6 groups.
function groupsToIPv4(high, low) {
  return [Math.floor(high / 256), high % 256, Math.floor(low / 256), low % 256];
}

/**
 * Whether an IP address is on this computer or the local network. IPv6
 * addresses that carry an IPv4 address (mapped, compatible, NAT64 and 6to4)
 * are judged by that address.
 *
 * @param {string} address - An IPv4 or IPv6 address.
 * @returns {boolean} Whether it is a loopback, private, link-local or other
 * non-public address.
 */
export function isLocalAddress(address) {
  const v4 = parseIPv4(address);
  if (v4) {
    return isLocalIPv4(v4);
  }
  const v6 = parseIPv6(address);
  if (!v6) {
    return false;
  }
  const [first] = v6;
  // Unique local (fc00::/7), link-local (fe80::/10), the old site-local
  // (fec0::/10) and multicast (ff00::/8).
  if (first >= 0xfc00) {
    return true;
  }
  if (v6.slice(0, 5).every((group) => group === 0)) {
    if (v6[5] === 0 && v6[6] === 0) {
      // :: and ::1.
      return v6[7] <= 1;
    }
    // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible).
    if (v6[5] === 0xffff || v6[5] === 0) {
      return isLocalIPv4(groupsToIPv4(v6[6], v6[7]));
    }
    return false;
  }
  // 64:ff9b::a.b.c.d (NAT64).
  if (
    first === 0x64 &&
    v6[1] === 0xff9b &&
    v6.slice(2, 6).every((group) => group === 0)
  ) {
    return isLocalIPv4(groupsToIPv4(v6[6], v6[7]));
  }
  // 2002:aabb:ccdd:: (6to4).
  if (first === 0x2002) {
    return isLocalIPv4(groupsToIPv4(v6[1], v6[2]));
  }
  return false;
}

// Names that only mean something on this computer or the local network.
const LOCAL_NAME_SUFFIXES = [
  'localhost',
  // Multicast DNS (RFC 6762).
  'local',
  // Home networks (RFC 8375).
  'home.arpa',
  // Reserved for private use by ICANN.
  'internal',
  // The default domain of many home routers.
  'lan',
];

/**
 * Whether a URL's host is on this computer or the local network: a local IP
 * address, a name under a local-only domain, or a name with no dot, which the
 * resolver completes with the local network's search domain. The URL parser
 * has already turned other spellings of an IPv4 address, such as 2130706433
 * or 0x7f.1, into dotted form.
 *
 * @param {string} hostname - A hostname from a parsed URL.
 * @returns {boolean} Whether it is a local host.
 */
export function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/u, '');
  if (parseIPv4(host) || host.startsWith('[')) {
    return isLocalAddress(host);
  }
  return (
    !host.includes('.') ||
    LOCAL_NAME_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  );
}

/**
 * Whether a hostname resolves to a local address. Only Firefox lets an
 * extension resolve names. Elsewhere this answers false, and only the name
 * itself is checked.
 *
 * @param {string} hostname - A hostname from a parsed URL.
 * @param {object} [dns] - The extension DNS API.
 * @returns {Promise<boolean>} Whether any address it resolves to is local.
 */
async function resolvesToLocal(hostname, dns) {
  // An IP address was checked as it is written.
  if (
    typeof dns?.resolve !== 'function' ||
    parseIPv4(hostname) ||
    hostname.startsWith('[')
  ) {
    return false;
  }
  const { addresses } = await dns.resolve(hostname);
  return addresses.some(isLocalAddress);
}

/**
 * Whether a value is an image data URL, which shows without a request.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is a data:image/ URL.
 */
export function isImageDataUrl(value) {
  return (
    typeof value === 'string' && /^data:image\/[a-z0-9.+-]+[;,]/iu.test(value)
  );
}

async function readAtMost(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > maxBytes ? undefined : bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Downloads an image a site named, once, so that the wallet can show it from
 * a data URL instead of asking the site's host each time it is displayed,
 * which would tell that host when the wallet is in use.
 *
 * Images on this computer or the local network are refused: a site must not
 * be able to make the wallet send requests to local services or devices. A failed download is tried once
 * more, and then given up.
 *
 * @param {string} url - An http(s) image URL.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - The fetch function to use.
 * @param {object} [options.dns] - The extension DNS API, if there is one.
 * @param {number} [options.retryDelay] - How long to wait before the retry.
 * @param {number} [options.maxBytes] - The largest image accepted.
 * @returns {Promise<string|undefined>} The image as a data URL, or undefined
 * if the URL does not give a small image.
 */
export async function fetchImageAsDataUrl(
  url,
  {
    fetch = fetchImage,
    dns = extension.dns,
    retryDelay = RETRY_DELAY_MS,
    maxBytes = MAX_IMAGE_BYTES,
  } = {},
) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return undefined;
  }
  if (isLocalHostname(parsed.hostname)) {
    return undefined;
  }
  const first = await downloadImage(parsed, { fetch, dns, maxBytes });
  if (first.retry) {
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    return (await downloadImage(parsed, { fetch, dns, maxBytes })).image;
  }
  return first.image;
}

/**
 * Makes one attempt at downloading an image.
 *
 * @param {URL} parsed - An http(s) URL whose hostname is not local.
 * @param {object} options - Options.
 * @param {Function} options.fetch - The fetch function to use.
 * @param {object} [options.dns] - The extension DNS API, if there is one.
 * @param {number} options.maxBytes - The largest image accepted.
 * @returns {Promise<{image?: string, retry?: boolean}>} The image as a data
 * URL, or whether the failure may pass if tried again.
 */
async function downloadImage(parsed, { fetch, dns, maxBytes }) {
  try {
    // Resolved just before the request, so the request uses the same answer.
    if (await resolvesToLocal(parsed.hostname, dns)) {
      return {};
    }
  } catch (_) {
    return { retry: true };
  }
  let response;
  try {
    response = await fetch(parsed.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      // A redirect could lead to a local host, after the checks above.
      redirect: 'error',
    });
  } catch (_) {
    return { retry: true };
  }
  if (!response.ok) {
    return { retry: true };
  }
  try {
    const type = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!IMAGE_TYPES.has(type)) {
      return {};
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      return {};
    }
    const bytes = await readAtMost(response, maxBytes);
    if (!bytes?.length) {
      return {};
    }
    return {
      image: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`,
    };
  } catch (_) {
    return { retry: true };
  }
}
