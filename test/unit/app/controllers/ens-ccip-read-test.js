import assert from 'assert';
import sinon from 'sinon';

import {
  MAX_GATEWAY_ATTEMPTS,
  MAX_GATEWAY_RESPONSE_BYTES,
  fetchOffchainData,
  gatewayRequestUrl,
} from '../../../../app/scripts/controllers/ens/ccip-read';

const SENDER = '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41';
const CALL_DATA = '0xdeadbeef';
const ANSWER =
  '0x00000000000000000000000000000000000000000000000000000000000000aa';

function jsonResponse(body, { status = 200 } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    arrayBuffer: async () => bytes.buffer,
  };
}

const lookup = (urls) => ({ urls, sender: SENDER, callData: CALL_DATA });

describe('CCIP-read gateways', function () {
  describe('gatewayRequestUrl', function () {
    it('fills in the sender and data, and uses GET when the URL takes the data', function () {
      const { url, isGet } = gatewayRequestUrl(
        'https://gateway.example/{sender}/{data}.json',
        SENDER,
        CALL_DATA,
      );
      assert.equal(
        url.href,
        `https://gateway.example/${SENDER}/${CALL_DATA}.json`,
      );
      assert.equal(isGet, true);
      assert.equal(
        gatewayRequestUrl('https://gateway.example/', SENDER, CALL_DATA).isGet,
        false,
      );
    });

    it('refuses plain http, credentials and local hosts', function () {
      for (const template of [
        'http://gateway.example/{data}',
        'https://user:pass@gateway.example/{data}',
        'https://localhost/{data}',
        'https://127.0.0.1/{data}',
        'https://192.168.1.1/',
        'https://router.lan/',
        'ftp://gateway.example/',
        'not a url',
        42,
      ]) {
        assert.equal(
          gatewayRequestUrl(template, SENDER, CALL_DATA),
          undefined,
          String(template),
        );
      }
    });
  });

  describe('fetchOffchainData', function () {
    it('returns a gateway’s answer, asking without credentials, referrer or redirects', async function () {
      const fetch = sinon.stub().resolves(jsonResponse({ data: ANSWER }));
      const data = await fetchOffchainData(
        lookup(['https://gateway.example/{sender}/{data}.json']),
        { fetch },
      );
      assert.equal(data, ANSWER);
      const [url, options] = fetch.firstCall.args;
      assert.equal(url, `https://gateway.example/${SENDER}/${CALL_DATA}.json`);
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
    });

    it('POSTs the sender and data when the URL does not take the data', async function () {
      const fetch = sinon.stub().resolves(jsonResponse({ data: ANSWER }));
      await fetchOffchainData(lookup(['https://gateway.example/lookup']), {
        fetch,
      });
      const [, options] = fetch.firstCall.args;
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), {
        data: CALL_DATA,
        sender: SENDER,
      });
    });

    it('never contacts an http gateway', async function () {
      const fetch = sinon.stub().resolves(jsonResponse({ data: ANSWER }));
      await assert.rejects(
        fetchOffchainData(lookup(['http://gateway.example/{data}']), {
          fetch,
        }),
        { code: 'offchainLookupFailed' },
      );
      assert.ok(fetch.notCalled);
    });

    it('skips an http gateway for the next https one', async function () {
      const fetch = sinon.stub().resolves(jsonResponse({ data: ANSWER }));
      await fetchOffchainData(
        lookup([
          'http://insecure.example/{data}',
          'https://gateway.example/{data}',
        ]),
        { fetch },
      );
      assert.equal(fetch.callCount, 1);
      assert.match(fetch.firstCall.args[0], /^https:\/\/gateway\.example\//u);
    });

    it('tries the next gateway after a failure, and fails when none answer', async function () {
      const fetch = sinon.stub();
      fetch.onCall(0).rejects(new TypeError('Failed to fetch'));
      fetch.onCall(1).resolves(jsonResponse({}, { status: 502 }));
      fetch.onCall(2).resolves(jsonResponse({ data: 'not hex' }));
      await assert.rejects(
        fetchOffchainData(
          lookup([
            'https://one.example/{data}',
            'https://two.example/{data}',
            'https://three.example/{data}',
          ]),
          { fetch },
        ),
        { code: 'offchainLookupFailed' },
      );
      assert.equal(fetch.callCount, 3);
    });

    it('stops at a 4xx answer', async function () {
      const fetch = sinon.stub().resolves(jsonResponse({}, { status: 404 }));
      await assert.rejects(
        fetchOffchainData(
          lookup(['https://one.example/{data}', 'https://two.example/{data}']),
          { fetch },
        ),
        { code: 'offchainLookupFailed' },
      );
      assert.equal(fetch.callCount, 1);
    });

    it('tries only a few gateways, however many the contract lists', async function () {
      const fetch = sinon.stub().rejects(new TypeError('Failed to fetch'));
      const urls = Array.from(
        { length: 10 },
        (_, i) => `https://gateway${i}.example/{data}`,
      );
      await assert.rejects(fetchOffchainData(lookup(urls), { fetch }), {
        code: 'offchainLookupFailed',
      });
      assert.equal(fetch.callCount, MAX_GATEWAY_ATTEMPTS);
    });

    it('refuses an oversized answer', async function () {
      const fetch = sinon.stub().resolves(
        jsonResponse({
          data: `0x${'00'.repeat(MAX_GATEWAY_RESPONSE_BYTES)}`,
        }),
      );
      await assert.rejects(
        fetchOffchainData(lookup(['https://gateway.example/{data}']), {
          fetch,
        }),
        { code: 'offchainLookupFailed' },
      );
    });

    it('gives up on a gateway that does not answer in time', async function () {
      const clock = sinon.useFakeTimers();
      try {
        const fetch = sinon.spy(
          (_url, { signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () =>
                reject(new Error('aborted')),
              );
            }),
        );
        const result = fetchOffchainData(
          lookup(['https://slow.example/{data}']),
          { fetch },
        );
        const settled = assert.rejects(result, {
          code: 'offchainLookupFailed',
        });
        await clock.tickAsync(10000);
        await settled;
      } finally {
        clock.restore();
      }
    });
  });
});
