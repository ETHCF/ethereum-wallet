import { strict as assert } from 'assert';

import {
  fetchImageAsDataUrl,
  isImageDataUrl,
  MAX_IMAGE_BYTES,
} from '../../../app/scripts/lib/remote-image';

function respond({ status = 200, type = 'image/png', body, length } = {}) {
  const bytes = body ?? new Uint8Array([1, 2, 3]);
  const headers = new Map([['content-type', type]]);
  if (length !== undefined) {
    headers.set('content-length', String(length));
  }
  return async (url, options) => ({
    url,
    options,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers.get(name) ?? null },
    arrayBuffer: async () => bytes.buffer,
  });
}

describe('remote images', function () {
  it('downloads an image as a data URL, without cookies or a referrer', async function () {
    let request;
    const fetch = async (url, options) => {
      request = { url, options };
      return respond({ type: 'image/png; charset=binary' })(url, options);
    };
    assert.equal(
      await fetchImageAsDataUrl('https://cdn.test/token.png', { fetch }),
      'data:image/png;base64,AQID',
    );
    assert.deepEqual(request, {
      url: 'https://cdn.test/token.png',
      options: { credentials: 'omit', referrerPolicy: 'no-referrer' },
    });
  });

  it('refuses anything that is not a small image', async function () {
    const cases = [
      ['a failed request', respond({ status: 404 })],
      ['HTML', respond({ type: 'text/html' })],
      ['no type', respond({ type: '' })],
      ['an empty body', respond({ body: new Uint8Array() })],
      ['a declared large body', respond({ length: MAX_IMAGE_BYTES + 1 })],
      ['a large body', respond({ body: new Uint8Array(MAX_IMAGE_BYTES + 1) })],
      [
        'a network error',
        async () => {
          throw new Error('offline');
        },
      ],
    ];
    for (const [description, fetch] of cases) {
      assert.equal(
        await fetchImageAsDataUrl('https://cdn.test/x', { fetch }),
        undefined,
        description,
      );
    }
  });

  it('only fetches http(s) URLs', async function () {
    let called = false;
    const fetch = async () => {
      called = true;
      return respond()();
    };
    for (const url of [
      'file:///etc/passwd',
      'chrome-extension://abc/x.png',
      'ftp://x.test/a.png',
      'not a url',
    ]) {
      assert.equal(await fetchImageAsDataUrl(url, { fetch }), undefined);
    }
    assert.equal(called, false);
  });

  it('recognizes image data URLs', function () {
    assert.equal(isImageDataUrl('data:image/png;base64,AAAA'), true);
    assert.equal(isImageDataUrl('data:image/svg+xml,%3Csvg%3E'), true);
    assert.equal(isImageDataUrl('data:text/html,<b>'), false);
    assert.equal(isImageDataUrl('https://x.test/a.png'), false);
    assert.equal(isImageDataUrl(undefined), false);
  });
});
