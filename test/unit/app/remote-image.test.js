import { strict as assert } from 'assert';
import sinon from 'sinon';

import {
  fetchImageAsDataUrl,
  isImageDataUrl,
  isLoopbackAddress,
  isLoopbackHostname,
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
      options: {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      },
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
        await fetchImageAsDataUrl('https://cdn.test/x', {
          fetch,
          retryDelay: 0,
        }),
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

  it('retries a failed download once, and then gives up', async function () {
    const failing = sinon.stub().rejects(new Error('offline'));
    assert.equal(
      await fetchImageAsDataUrl('https://cdn.test/x', {
        fetch: failing,
        retryDelay: 0,
      }),
      undefined,
    );
    assert.equal(failing.callCount, 2);

    const flaky = sinon.stub();
    flaky.onFirstCall().callsFake(respond({ status: 503 }));
    flaky.onSecondCall().callsFake(respond());
    assert.equal(
      await fetchImageAsDataUrl('https://cdn.test/x', {
        fetch: flaky,
        retryDelay: 0,
      }),
      'data:image/png;base64,AQID',
    );

    // An answer that is not a small image will not change: no retry.
    const html = sinon.stub().callsFake(respond({ type: 'text/html' }));
    await fetchImageAsDataUrl('https://cdn.test/x', {
      fetch: html,
      retryDelay: 0,
    });
    assert.equal(html.callCount, 1);
  });

  it('never fetches from this computer', async function () {
    const fetch = sinon.stub().callsFake(respond());
    for (const url of [
      'http://localhost/a.png',
      'http://LOCALHOST./a.png',
      'http://app.localhost:3000/a.png',
      'http://127.0.0.1/a.png',
      'http://127.1.2.3:8545/a.png',
      'http://2130706433/a.png',
      'http://0x7f.1/a.png',
      'http://0.0.0.0/a.png',
      'http://0/a.png',
      'http://[::1]/a.png',
      'http://[::]/a.png',
      'http://[::ffff:127.0.0.1]/a.png',
      'http://[0:0:0:0:0:0:0:1]/a.png',
    ]) {
      assert.equal(await fetchImageAsDataUrl(url, { fetch }), undefined, url);
    }
    assert.equal(fetch.called, false);
  });

  it('refuses a name that resolves to this computer', async function () {
    const fetch = sinon.stub().callsFake(respond());
    const resolvesTo = (addresses) => ({
      resolve: sinon.stub().resolves({ addresses }),
    });

    for (const addresses of [['127.0.0.1'], ['93.184.215.14', '::1']]) {
      const dns = resolvesTo(addresses);
      assert.equal(
        await fetchImageAsDataUrl('https://rebind.test/a.png', { fetch, dns }),
        undefined,
      );
      assert.deepEqual(dns.resolve.firstCall.args, ['rebind.test']);
    }
    assert.equal(fetch.called, false);

    assert.equal(
      await fetchImageAsDataUrl('https://cdn.test/a.png', {
        fetch,
        dns: resolvesTo(['93.184.215.14']),
      }),
      'data:image/png;base64,AQID',
    );
  });

  it('recognizes loopback addresses', function () {
    for (const address of [
      '127.0.0.1',
      '127.255.255.254',
      '0.0.0.0',
      '::1',
      '::',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::127.0.0.1',
      '0:0:0:0:0:0:0:1',
      '[::1]',
      '::1%lo',
    ]) {
      assert.equal(isLoopbackAddress(address), true, address);
    }
    for (const address of [
      '128.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '::2',
      '::ffff:10.0.0.1',
      '2001:db8::1',
      'fe80::1',
      '1::',
      '256.0.0.1',
      'not an address',
    ]) {
      assert.equal(isLoopbackAddress(address), false, address);
    }
    assert.equal(isLoopbackHostname('sub.localhost'), true);
    assert.equal(isLoopbackHostname('localhost.example.com'), false);
    assert.equal(isLoopbackHostname('notlocalhost'), false);
  });

  it('recognizes image data URLs', function () {
    assert.equal(isImageDataUrl('data:image/png;base64,AAAA'), true);
    assert.equal(isImageDataUrl('data:image/svg+xml,%3Csvg%3E'), true);
    assert.equal(isImageDataUrl('data:text/html,<b>'), false);
    assert.equal(isImageDataUrl('https://x.test/a.png'), false);
    assert.equal(isImageDataUrl(undefined), false);
  });
});
