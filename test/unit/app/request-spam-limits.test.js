import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { providerErrors } from '@metamask/rpc-errors';
import { strict as assert } from 'assert';

import createDupeReqFilterStream, {
  SEEN_ID_LIFETIME_MS,
} from '../../../app/scripts/lib/createDupeReqFilterStream';
import OriginThrottler, {
  BLOCK_DURATION_MS,
  MAX_PENDING_PER_ORIGIN,
  REJECTION_WINDOW_MS,
} from '../../../app/scripts/lib/origin-throttler';

describe('Request spam limits', function () {
  describe('OriginThrottler', function () {
    let time;
    let throttler;
    let rejectNext;

    function engineFor(origin) {
      const engine = new JsonRpcEngine();
      engine.push(throttler.createMiddleware({ origin }));
      engine.push((_req, res, _next, end) => {
        if (rejectNext) {
          end(providerErrors.userRejectedRequest());
          return;
        }
        res.result = true;
        end();
      });
      return engine;
    }

    const send = (engine, method = 'personal_sign') =>
      engine.handle({ id: Math.random(), jsonrpc: '2.0', method, params: [] });

    beforeEach(function () {
      time = 1000000;
      throttler = new OriginThrottler({ now: () => time });
      rejectNext = true;
    });

    it('blocks prompting requests for a minute after three quick rejections, across tabs', async function () {
      const tab = engineFor('https://spam.test');
      for (let i = 0; i < 3; i++) {
        assert.equal((await send(tab)).error.code, 4001);
        time += 1000;
      }
      const otherTab = engineFor('https://spam.test');
      const blocked = await send(otherTab, 'eth_sendTransaction');
      assert.equal(blocked.error.code, 4100);
      assert.match(blocked.error.message, /rejected several requests/u);

      // Other sites and non-prompting requests are unaffected.
      rejectNext = false;
      assert.equal((await send(engineFor('https://other.test'))).result, true);
      assert.equal((await send(tab, 'eth_chainId')).result, true);

      time += BLOCK_DURATION_MS;
      assert.equal((await send(tab)).result, true);
    });

    it('does not count rejections spread over more than the window', async function () {
      const tab = engineFor('https://site.test');
      await send(tab);
      await send(tab);
      time += REJECTION_WINDOW_MS + 1;
      await send(tab);
      assert.equal(
        (await send(tab)).error.code,
        4001,
        'only two rejections inside the window',
      );
    });

    it('does not let a request answered without a prompt reset the count', async function () {
      const tab = engineFor('https://site.test');
      await send(tab);
      await send(tab);
      // For example wallet_switchEthereumChain to the current chain, which
      // succeeds at once.
      rejectNext = false;
      assert.equal(
        (await send(tab, 'wallet_switchEthereumChain')).result,
        true,
      );
      rejectNext = true;
      await send(tab);
      assert.equal((await send(tab)).error.code, 4100);
    });

    it('limits how many prompts a site may have waiting', async function () {
      const engine = new JsonRpcEngine();
      engine.push(throttler.createMiddleware({ origin: 'https://flood.test' }));
      const waiting = [];
      engine.push((_req, res, _next, end) => {
        waiting.push(() => {
          res.result = true;
          end();
        });
      });
      const requests = Array.from({ length: MAX_PENDING_PER_ORIGIN }, () =>
        send(engine),
      );
      await new Promise((resolve) => setImmediate(resolve));
      const extra = await send(engine);
      assert.equal(extra.error.code, -32005);
      assert.equal(waiting.length, MAX_PENDING_PER_ORIGIN);

      // Answering one makes room for another.
      waiting.shift()();
      await requests[0];
      send(engine);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(waiting.length, MAX_PENDING_PER_ORIGIN);
      waiting.forEach((answer) => answer());
      await Promise.all(requests);
    });
  });

  describe('createDupeReqFilterStream', function () {
    function collect(stream, writes) {
      const out = [];
      stream.on('data', (chunk) => out.push(chunk));
      writes.forEach((chunk) => stream.write(chunk));
      return out;
    }

    it('drops a repeated request ID but passes notifications and new IDs', function () {
      const stream = createDupeReqFilterStream();
      const out = collect(stream, [
        { id: 1, method: 'personal_sign' },
        { id: 1, method: 'personal_sign' },
        { method: 'notification' },
        { method: 'notification' },
        { id: 2, method: 'eth_chainId' },
      ]);
      assert.deepEqual(
        out.map(({ id, method }) => `${id}:${method}`),
        [
          '1:personal_sign',
          'undefined:notification',
          'undefined:notification',
          '2:eth_chainId',
        ],
      );
    });

    it('forgets IDs after a minute', function () {
      let time = 0;
      const stream = createDupeReqFilterStream({ now: () => time });
      const out = [];
      stream.on('data', (chunk) => out.push(chunk.id));
      stream.write({ id: 7 });
      time += SEEN_ID_LIFETIME_MS + 1;
      stream.write({ id: 8 });
      stream.write({ id: 7 });
      assert.deepEqual(out, [7, 8, 7]);
    });
  });
});
