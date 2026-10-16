import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { getAutoLockDeadline } from '../../../app/scripts/lib/auto-lock';
import PhishingWarnings from '../../../app/scripts/lib/phishing-warnings';
import selectChainId from '../../../app/scripts/lib/select-chain-id';

function fakeStorageArea(initial = {}) {
  const items = { ...initial };
  return {
    items,
    get: sinon.spy(async (keys) => {
      if (keys === null) {
        return { ...items };
      }
      const result = {};
      for (const key of [].concat(keys)) {
        if (Object.hasOwn(items, key)) {
          result[key] = items[key];
        }
      }
      return result;
    }),
    set: sinon.spy(async (values) => {
      Object.assign(items, values);
    }),
    remove: sinon.spy(async (keys) => {
      for (const key of [].concat(keys)) {
        delete items[key];
      }
    }),
  };
}

function esModule(value) {
  return { __esModule: true, default: value, '@noCallThru': true };
}

describe('background helpers', function () {
  describe('getAutoLockDeadline', function () {
    it('locks the given number of minutes after the last activity', function () {
      assert.equal(
        getAutoLockDeadline({ timeoutMinutes: 5, lastActiveTime: 1000 }),
        1000 + 5 * 60 * 1000,
      );
      assert.equal(
        getAutoLockDeadline({ timeoutMinutes: 0.5, lastActiveTime: 0 }),
        30000,
      );
    });

    it('has no deadline when auto-lock is off', function () {
      assert.equal(
        getAutoLockDeadline({ timeoutMinutes: 0, lastActiveTime: 1000 }),
        null,
      );
      assert.equal(getAutoLockDeadline({ lastActiveTime: 1000 }), null);
      assert.equal(
        getAutoLockDeadline({ timeoutMinutes: null, lastActiveTime: 1000 }),
        null,
      );
    });
  });

  describe('PhishingWarnings', function () {
    it('keeps a warning for each tab', async function () {
      const storage = fakeStorageArea();
      const warnings = new PhishingWarnings(storage);
      await warnings.set(1, {
        hostname: 'one.example',
        href: 'https://one.example/a',
      });
      await warnings.set(2, {
        hostname: 'two.example',
        href: 'https://two.example/b',
      });
      assert.deepEqual(await warnings.get(1), {
        hostname: 'one.example',
        href: 'https://one.example/a',
      });
      assert.deepEqual(await warnings.get(2), {
        hostname: 'two.example',
        href: 'https://two.example/b',
      });
      assert.equal(await warnings.get(3), undefined);
    });

    it('stores only the hostname and destination', async function () {
      const storage = fakeStorageArea();
      await new PhishingWarnings(storage).set(1, {
        hostname: 'one.example',
        href: 'https://one.example/',
        extra: 'ignored',
      });
      assert.deepEqual(storage.items, {
        'phishingWarning:1': {
          hostname: 'one.example',
          href: 'https://one.example/',
        },
      });
    });

    it('leaves a warning in place when read, and removes it when taken', async function () {
      const warnings = new PhishingWarnings(fakeStorageArea());
      const warning = { hostname: 'one.example', href: 'https://one.example/' };
      await warnings.set(1, warning);
      assert.deepEqual(await warnings.get(1), warning);
      assert.deepEqual(await warnings.take(1), warning);
      assert.equal(await warnings.take(1), undefined);
      assert.equal(await warnings.get(1), undefined);
    });
  });

  describe('selectChainId', function () {
    it('reports the chain ID of a built-in network, whatever was stored', function () {
      assert.equal(
        selectChainId({ provider: { type: 'mainnet', chainId: '0x5' } }),
        '0x1',
      );
    });

    it('normalizes a custom network chain ID', function () {
      assert.equal(
        selectChainId({ provider: { type: 'rpc', chainId: '0X2A' } }),
        '0x2a',
      );
      assert.equal(
        selectChainId({ provider: { type: 'rpc', chainId: '42' } }),
        '0x2a',
      );
    });

    it('reports no chain ID rather than a guess', function () {
      for (const chainId of [undefined, '', 'garbage', '0x0', '-1']) {
        assert.equal(
          selectChainId({ provider: { type: 'rpc', chainId } }),
          undefined,
          `chainId ${chainId}`,
        );
      }
    });
  });

  describe('ExtensionStore (local-store)', function () {
    function loadStore(extension) {
      const logError = sinon.spy();
      const { default: ExtensionStore } = proxyquire(
        '../../../app/scripts/lib/local-store',
        {
          './extension-api': esModule(extension),
          loglevel: { __esModule: true, default: { error: logError } },
        },
      );
      return { ExtensionStore, logError };
    }

    it('reads and writes extension local storage', async function () {
      const local = fakeStorageArea({ data: { a: 1 } });
      const { ExtensionStore } = loadStore({ storage: { local } });
      const store = new ExtensionStore();
      assert.equal(store.isSupported, true);
      assert.deepEqual(await store.get(), { data: { a: 1 } });
      await store.set({ data: { a: 2 }, meta: { version: 3 } });
      assert.deepEqual(local.items, { data: { a: 2 }, meta: { version: 3 } });
    });

    it('treats empty storage as nothing saved', async function () {
      const { ExtensionStore } = loadStore({
        storage: { local: fakeStorageArea() },
      });
      assert.equal(await new ExtensionStore().get(), undefined);
    });

    it('reports a missing storage API and returns nothing', async function () {
      const { ExtensionStore, logError } = loadStore({});
      const store = new ExtensionStore();
      assert.equal(store.isSupported, false);
      assert.equal(logError.calledOnce, true);
      assert.equal(await store.get(), undefined);
    });
  });

  describe('ReadOnlyNetworkStore (network-store)', function () {
    function loadStore({ persisted, fetch }) {
      const localStore = {
        get: sinon.stub().resolves(persisted),
        set: sinon.stub().resolves(),
      };
      const { default: ReadOnlyNetworkStore } = proxyquire(
        '../../../app/scripts/lib/network-store',
        {
          './local-store': esModule(function () {
            return localStore;
          }),
          './browser-global': esModule({ fetch }),
        },
      );
      return { store: new ReadOnlyNetworkStore(), localStore };
    }

    it('seeds an empty profile from the fixture server', async function () {
      const fixture = { data: { seeded: true } };
      const fetch = sinon.stub().resolves({
        ok: true,
        json: async () => fixture,
      });
      const { store } = loadStore({ persisted: undefined, fetch });
      assert.deepEqual(await store.get(), fixture);
      assert.deepEqual(fetch.args, [['http://localhost:12345/state.json']]);
    });

    it('restores persisted state instead of the fixture', async function () {
      const fetch = sinon.stub().rejects(new Error('should not be fetched'));
      const persisted = { data: { changedByTest: true } };
      const { store } = loadStore({ persisted, fetch });
      assert.deepEqual(await store.get(), persisted);
      assert.equal(fetch.called, false);
    });

    it('starts empty when the fixture server cannot be reached', async function () {
      const { store } = loadStore({
        persisted: undefined,
        fetch: sinon.stub().rejects(new Error('offline')),
      });
      assert.equal(await store.get(), undefined);
    });

    it('starts empty when the fixture server has no state', async function () {
      const { store } = loadStore({
        persisted: undefined,
        fetch: sinon.stub().resolves({ ok: false }),
      });
      assert.equal(await store.get(), undefined);
    });

    it('persists state set after loading', async function () {
      const { store, localStore } = loadStore({
        persisted: { data: { old: true } },
        fetch: sinon.stub(),
      });
      const next = { data: { new: true } };
      await store.set(next);
      assert.deepEqual(await store.get(), next);
      assert.deepEqual(localStore.set.args, [[next]]);
    });
  });
});
