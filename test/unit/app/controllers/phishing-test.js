import { strict as assert } from 'assert';

import PhishingController, {
  LIST_KEY,
  META_KEY,
} from '../../../../app/scripts/controllers/phishing';

const HOUR = 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000;

const list = {
  version: 2,
  tolerance: 1,
  fuzzylist: [],
  whitelist: [],
  blacklist: ['evil.test'],
};
const reply = (body, status = 200, etag = '') => ({
  ok: status === 200,
  status,
  json: async () => body,
  headers: { get: () => etag },
});

function fakeStorage(initial = {}) {
  const items = { ...initial };
  const writes = [];
  return {
    items,
    writes,
    get: async (keys) =>
      Object.fromEntries(
        keys
          .filter((key) => Object.hasOwn(items, key))
          .map((key) => [key, items[key]]),
      ),
    set: async (values) => {
      writes.push(Object.keys(values).sort());
      Object.assign(items, values);
    },
  };
}

function createController({ replies = [], storage, start = 1000 } = {}) {
  const clock = { now: start };
  const requests = [];
  const controller = new PhishingController({
    fetch: async (_, opts) => {
      requests.push(opts.headers['If-None-Match']);
      return replies.shift() ?? reply({}, 500);
    },
    storage,
    now: () => clock.now,
  });
  return { controller, requests, clock };
}

describe('PhishingController', function () {
  it('uses the bundled list until a download succeeds', async function () {
    const { controller } = createController({ replies: [reply({}, 500)] });
    await controller.ready;
    assert.equal(controller.test('ethcf.org'), false);
    assert.equal(controller.test('evil.test'), false);
    assert.equal(controller.test('nfts-mints.com'), true);
  });

  it('downloads and saves the list when nothing is saved', async function () {
    const storage = fakeStorage();
    const { controller, requests } = createController({
      replies: [reply(list, 200, 'v1')],
      storage,
    });
    await controller.ready;
    assert.deepEqual(requests, ['']);
    assert.equal(controller.test('evil.test'), true);
    assert.deepEqual(storage.items[LIST_KEY], list);
    assert.deepEqual(storage.items[META_KEY], {
      etag: 'v1',
      nextCheck: 1000 + HOUR,
    });
  });

  it('reuses the saved list after a restart without downloading it', async function () {
    const storage = fakeStorage({
      [LIST_KEY]: list,
      [META_KEY]: { etag: 'v1', nextCheck: 1000 + HOUR },
    });
    const { controller, requests } = createController({ storage, start: 2000 });
    await controller.ready;
    assert.equal(controller.test('evil.test'), true);
    await controller.maybeUpdate();
    assert.deepEqual(requests, []);
    assert.deepEqual(storage.writes, []);
  });

  it('does not download before the saved list has loaded', async function () {
    let finishLoading;
    const loading = new Promise((resolve) => {
      finishLoading = resolve;
    });
    const storage = fakeStorage({
      [LIST_KEY]: list,
      [META_KEY]: { etag: 'v1', nextCheck: 1000 + HOUR },
    });
    const { get } = storage;
    storage.get = async (keys) => {
      await loading;
      return get(keys);
    };
    const { controller, requests } = createController({ storage, start: 2000 });
    controller.test('a.test');
    controller.maybeUpdate();
    finishLoading();
    await controller.ready;
    await controller.maybeUpdate();
    assert.deepEqual(requests, []);
    assert.equal(controller.test('evil.test'), true);
  });

  it('checks for a newer list once the interval has passed, rewriting only the metadata when unchanged', async function () {
    const storage = fakeStorage({
      [LIST_KEY]: list,
      [META_KEY]: { etag: 'v1', nextCheck: 1000 + HOUR },
    });
    const { controller, requests, clock } = createController({
      replies: [reply(null, 304)],
      storage,
      start: 2000,
    });
    await controller.ready;
    clock.now = 1000 + HOUR;
    controller.test('ethcf.org');
    await controller.maybeUpdate();
    assert.deepEqual(requests, ['v1']);
    assert.deepEqual(storage.writes, [[META_KEY]]);
    assert.deepEqual(storage.items[META_KEY], {
      etag: 'v1',
      nextCheck: 1000 + 2 * HOUR,
    });
    assert.equal(controller.test('evil.test'), true);
  });

  it('waits out the retry delay after a failed download, even across restarts', async function () {
    const storage = fakeStorage();
    const first = createController({ replies: [reply({}, 500)], storage });
    await first.controller.ready;
    assert.deepEqual(storage.items[META_KEY], {
      etag: '',
      nextCheck: 1000 + RETRY,
    });
    const restarted = createController({ storage, start: 2000 });
    await restarted.controller.ready;
    assert.deepEqual(restarted.requests, []);
    restarted.clock.now = 1000 + RETRY;
    await restarted.controller.maybeUpdate();
    assert.deepEqual(restarted.requests, ['']);
  });

  it('downloads at most one list at a time', async function () {
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const controller = new PhishingController({
      fetch: async () => {
        calls += 1;
        await pending;
        return reply(list);
      },
    });
    controller.test('a.test');
    controller.test('b.test');
    release();
    await controller.ready;
    await controller.maybeUpdate();
    assert.equal(calls, 1);
    assert.equal(controller.test('evil.test'), true);
  });

  it('replaces a damaged saved list straight away, ignoring its ETag', async function () {
    const storage = fakeStorage({
      [LIST_KEY]: { ...list, blacklist: [] },
      [META_KEY]: { etag: 'v1', nextCheck: 1000 + HOUR },
    });
    const { controller, requests } = createController({
      replies: [reply(list, 200, 'v2')],
      storage,
      start: 2000,
    });
    await controller.ready;
    assert.deepEqual(requests, ['']);
    assert.equal(controller.test('evil.test'), true);
    assert.equal(storage.items[META_KEY].etag, 'v2');
  });

  it('keeps the current list when a download is empty or malformed', async function () {
    const bodies = [
      reply(list),
      reply({}),
      reply({ ...list, blacklist: [] }),
      reply({ ...list, whitelist: [1] }),
      reply(null),
    ];
    const controller = new PhishingController({
      fetch: async () => bodies.shift(),
    });
    await controller.ready;
    for (let i = 0; i < 4; i++) {
      await assert.rejects(
        controller.updatePhishingList(),
        /Invalid phishing list/u,
      );
    }
    assert.equal(controller.test('evil.test'), true);
  });

  it('does not download while updates are not allowed, and catches up once they are', async function () {
    let allowed = false;
    const requests = [];
    const controller = new PhishingController({
      fetch: async () => {
        requests.push(true);
        return reply(list);
      },
      canUpdate: () => allowed,
    });
    await controller.ready;
    controller.test('a.test');
    await controller.maybeUpdate();
    assert.equal(requests.length, 0);
    assert.equal(controller.test('evil.test'), false);
    allowed = true;
    await controller.maybeUpdate();
    assert.equal(requests.length, 1);
    assert.equal(controller.test('evil.test'), true);
  });

  it('stops warning about a bypassed hostname', async function () {
    const { controller } = createController({ replies: [reply(list)] });
    await controller.ready;
    controller.bypass('evil.test');
    assert.equal(controller.test('evil.test'), false);
  });
});
