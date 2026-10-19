import { strict as assert } from 'assert';
import sinon from 'sinon';

import {
  fetchImageAsDataUrl,
  isImageDataUrl,
  isLocalAddress,
  isLocalHostname,
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

  it('accepts a larger image when asked to', async function () {
    const body = new Uint8Array(MAX_IMAGE_BYTES + 1);
    assert.equal(
      await fetchImageAsDataUrl('https://cdn.test/x', {
        fetch: respond({ body }),
      }),
      undefined,
    );
    assert.ok(
      await fetchImageAsDataUrl('https://cdn.test/x', {
        fetch: respond({ body }),
        maxBytes: MAX_IMAGE_BYTES * 2,
      }),
    );
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

  it('only fetches https URLs', async function () {
    let called = false;
    const fetch = async () => {
      called = true;
      return respond()();
    };
    for (const url of [
      'http://example.com/a.png',
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

  it('never fetches from this computer or the local network', async function () {
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
      'http://192.168.1.1/a.png',
      'http://10.0.0.1/a.png',
      'http://172.16.0.1/a.png',
      'http://169.254.169.254/latest/meta-data',
      'http://[::ffff:192.168.1.1]/a.png',
      'http://[fd00::1]/a.png',
      'http://[fe80::1]/a.png',
      'http://router/a.png',
      'http://printer.local/a.png',
      'http://nas.home.arpa/a.png',
      'http://svc.internal/a.png',
      'http://gateway.lan/a.png',
    ]) {
      assert.equal(await fetchImageAsDataUrl(url, { fetch }), undefined, url);
    }
    assert.equal(fetch.called, false);
  });

  it('refuses a name that resolves to a local address', async function () {
    const fetch = sinon.stub().callsFake(respond());
    const resolvesTo = (addresses) => ({
      resolve: sinon.stub().resolves({ addresses }),
    });

    for (const addresses of [
      ['127.0.0.1'],
      ['93.184.215.14', '::1'],
      ['192.168.0.10'],
      ['fd12:3456::1'],
    ]) {
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
        dns: resolvesTo([
          '93.184.215.14',
          '2606:2800:21f:cb07:6820:80da:af6b:8b2c',
        ]),
      }),
      'data:image/png;base64,AQID',
    );
  });

  it('recognizes local addresses', function () {
    for (const address of [
      '127.0.0.1',
      '127.255.255.254',
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '100.127.255.255',
      '169.254.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:c0a8:101',
      '::127.0.0.1',
      '0:0:0:0:0:0:0:1',
      '[::1]',
      '::1%lo',
      'fc00::1',
      'fdff:ffff::1',
      'fe80::1',
      'fe80::1%eth0',
      'ff02::1',
      '64:ff9b::10.0.0.1',
      '2002:c0a8:101::1',
      '192.0.0.8',
      '198.18.0.1',
      '198.19.255.255',
      '::ffff:0:7f00:1',
      '::ffff:0:192.168.1.1',
      '64:ff9b:1::8.8.8.8',
      '64:ff9b:1:abcd::1',
    ]) {
      assert.equal(isLocalAddress(address), true, address);
    }
    for (const address of [
      '1.1.1.1',
      '93.184.215.14',
      '100.63.255.255',
      '100.128.0.0',
      '128.0.0.1',
      '172.15.255.255',
      '172.32.0.0',
      '192.169.0.1',
      '192.0.1.1',
      '198.17.255.255',
      '198.20.0.0',
      '223.255.255.255',
      '::2',
      '::ffff:8.8.8.8',
      '2001:db8::1',
      '2606:4700::1111',
      '64:ff9b::8.8.8.8',
      '::ffff:0:8.8.8.8',
      '64:ff9b:2::1',
      '2002:808:808::1',
      'fbff::1',
      '1::',
      '256.0.0.1',
      'not an address',
    ]) {
      assert.equal(isLocalAddress(address), false, address);
    }
  });

  it('recognizes local hostnames', function () {
    for (const host of [
      'localhost',
      'sub.localhost',
      'router',
      'printer.local',
      'nas.home.arpa',
      'svc.internal',
      'gateway.lan',
      '192.168.1.1',
      '[fd00::1]',
      'localhost..',
      '127.0.0.1..',
      'router.lan...',
    ]) {
      assert.equal(isLocalHostname(host), true, host);
    }
    for (const host of [
      'example.com',
      'localhost.example.com',
      'local.example.com',
      'notlocalhost.com',
      'cdn.lan.example',
      '8.8.8.8',
      '[2606:4700::1111]',
    ]) {
      assert.equal(isLocalHostname(host), false, host);
    }
  });

  it('recognizes image data URLs', function () {
    assert.equal(isImageDataUrl('data:image/png;base64,AAAA'), true);
    assert.equal(isImageDataUrl('data:image/svg+xml,%3Csvg%3E'), true);
    assert.equal(isImageDataUrl('data:text/html,<b>'), false);
    assert.equal(isImageDataUrl('https://x.test/a.png'), false);
    assert.equal(isImageDataUrl(undefined), false);
  });
});
