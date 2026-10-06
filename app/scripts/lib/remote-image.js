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
 * @param {string} url - An http(s) image URL.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - The fetch function to use.
 * @returns {Promise<string|undefined>} The image as a data URL, or undefined
 * if the URL does not give a small image.
 */
export async function fetchImageAsDataUrl(url, { fetch = fetchImage } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return undefined;
  }
  try {
    const response = await fetch(parsed.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
      return undefined;
    }
    const type = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!IMAGE_TYPES.has(type)) {
      return undefined;
    }
    if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
      return undefined;
    }
    const bytes = await readAtMost(response, MAX_IMAGE_BYTES);
    if (!bytes?.length) {
      return undefined;
    }
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch (_) {
    return undefined;
  }
}
