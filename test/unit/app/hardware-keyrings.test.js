import { strict as assert } from 'assert';
import sinon from 'sinon';

import extension from '../../../app/scripts/lib/extension-api';
import {
  createRemoteKeyring,
  closeHardwareConnections,
} from '../../../app/scripts/lib/hardware-keyrings';
import { createTransaction } from '../../../app/scripts/lib/transaction-codec';

function deferred() {
  let resolve;
  const promise = new Promise((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
}

describe('Manifest V3 hardware transport', function () {
  describe('connection tab cleanup', function () {
    let sandbox, runtime, tabs, openTabs, nextTabId;

    beforeEach(function () {
      sandbox = sinon.createSandbox();
      openTabs = new Map();
      nextTabId = 0;
      runtime = {
        getURL: (path) => `chrome-extension://test/${path}`,
        getContexts: sandbox.stub().callsFake(async ({ documentUrls }) =>
          Array.from(openTabs.values())
            .filter((tab) => !documentUrls || documentUrls.includes(tab.url))
            .map((tab) => ({
              tabId: tab.id,
              windowId: tab.windowId,
              documentUrl: tab.url,
            })),
        ),
        sendMessage: sandbox.stub().callsFake(async ({ state }) => ({
          result: 'signed',
          state,
          unlocked: true,
        })),
      };
      tabs = {
        create: sandbox.stub().callsFake(async (options) => {
          nextTabId += 1;
          const tab = { ...options, id: nextTabId, status: 'complete' };
          openTabs.set(tab.id, tab);
          return tab;
        }),
        get: sandbox.stub().callsFake(async (id) => openTabs.get(id)),
        update: sandbox.stub().callsFake(async (id, options) => {
          for (const tab of openTabs.values()) {
            tab.active = tab.id === id && options.active;
          }
        }),
        remove: sandbox.stub().callsFake(async (id) => {
          openTabs.delete(id);
        }),
      };
      // Outside an extension the API is an empty object, so add the fakes.
      Object.assign(extension, { runtime, tabs });
    });

    afterEach(async function () {
      try {
        await closeHardwareConnections();
      } finally {
        sandbox.restore();
        delete extension.runtime;
        delete extension.tabs;
      }
    });

    it('closes after signing and reopens for the next request without losing account state', async function () {
      const Keyring = createRemoteKeyring('Trezor Hardware');
      const state = { accounts: ['0x1234'], hdPath: "m/44'/60'/0'/0", page: 2 };
      const keyring = new Keyring(state);
      const first = keyring.signPersonalMessage('0x1234', '0x01');
      const next = keyring.signTypedData(
        '0x1234',
        { message: 'next' },
        { version: 'V4' },
      );
      assert.equal(await first, 'signed');
      assert.equal(await next, 'signed');
      assert.equal(openTabs.size, 0);
      assert.equal(tabs.create.callCount, 2);
      assert.equal(tabs.remove.callCount, 2);
      assert.deepEqual(runtime.sendMessage.secondCall.args[0].state, state);
      assert.deepEqual(await keyring.serialize(), state);
    });

    it('keeps the tab open for account selection and closes it after importing an account', async function () {
      const Keyring = createRemoteKeyring('Trezor Hardware');
      const keyring = new Keyring();
      await keyring.getFirstPage();
      await keyring.getNextPage();
      assert.equal(openTabs.size, 1);
      assert.equal(tabs.create.callCount, 1);
      await keyring.addAccounts(1);
      assert.equal(openTabs.size, 0);
    });

    it('returns to the wallet tab after account discovery activates the connection tab', async function () {
      const walletUrl = 'chrome-extension://test/home.html#new-account/connect';
      openTabs.set(100, { id: 100, url: walletUrl, windowId: 1 });
      openTabs.set(101, {
        id: 101,
        url: 'chrome-extension://test/home.html',
        windowId: 2,
      });
      runtime.sendMessage.callsFake(async ({ state }) => {
        // Trezor's popup closes and the browser focuses its opener.
        openTabs.get(1).active = true;
        return { result: [], state, unlocked: true };
      });
      tabs.create.callsFake(async (options) => {
        const tab = { ...options, id: 1, windowId: 1, status: 'complete' };
        openTabs.set(tab.id, tab);
        return tab;
      });
      const Keyring = createRemoteKeyring('Trezor Hardware');
      await new Keyring().getFirstPage();
      assert.deepEqual(tabs.update.args, [[100, { active: true }]]);
    });

    it('leaves focus alone when the connection tab is in the background', async function () {
      openTabs.set(100, {
        id: 100,
        url: 'chrome-extension://test/home.html',
        windowId: 1,
      });
      const Keyring = createRemoteKeyring('Trezor Hardware');
      await new Keyring().getFirstPage();
      assert.equal(tabs.update.callCount, 0);
    });

    it('keeps the discovered accounts when returning to the wallet fails', async function () {
      runtime.sendMessage.callsFake(async ({ state }) => {
        openTabs.get(1).active = true;
        return { result: ['0x1234'], state, unlocked: true };
      });
      tabs.create.callsFake(async (options) => {
        const tab = { ...options, id: 1, windowId: 1, status: 'complete' };
        openTabs.set(tab.id, tab);
        return tab;
      });
      runtime.getContexts.onCall(1).rejects(new Error('No contexts'));
      const Keyring = createRemoteKeyring('Trezor Hardware');
      assert.deepEqual(await new Keyring().getFirstPage(), ['0x1234']);
    });

    it('waits for every in-flight request before closing the shared tab', async function () {
      const firstStarted = deferred();
      const secondStarted = deferred();
      const firstResult = deferred();
      const secondResult = deferred();
      runtime.sendMessage.onFirstCall().callsFake(async ({ state }) => {
        firstStarted.resolve();
        await firstResult.promise;
        return { result: 'first signature', state };
      });
      runtime.sendMessage.onSecondCall().callsFake(async ({ state }) => {
        secondStarted.resolve();
        await secondResult.promise;
        return { result: 'second signature', state };
      });
      const Trezor = createRemoteKeyring('Trezor Hardware');
      const Ledger = createRemoteKeyring('Ledger Hardware');
      const first = new Trezor().signPersonalMessage('address', '0x01');
      const second = new Ledger().signPersonalMessage('address', '0x02');
      await Promise.all([firstStarted.promise, secondStarted.promise]);
      assert.equal(tabs.create.callCount, 1);
      firstResult.resolve();
      assert.equal(await first, 'first signature');
      assert.equal(openTabs.size, 1);
      secondResult.resolve();
      assert.equal(await second, 'second signature');
      assert.equal(openTabs.size, 0);
    });

    it('waits for closing to finish before opening a new transport', async function () {
      const finishClosing = deferred();
      tabs.remove.callsFake(async (id) => {
        await finishClosing.promise;
        openTabs.delete(id);
      });
      const Keyring = createRemoteKeyring('Trezor Hardware');
      const first = new Keyring().signPersonalMessage('address', '0x01');
      let next;
      try {
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(tabs.remove.callCount, 1);
        next = new Keyring().signPersonalMessage('address', '0x02');
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(runtime.sendMessage.callCount, 1);
      } finally {
        finishClosing.resolve();
        await Promise.all([first, next]);
      }
      assert.equal(await first, 'signed');
      assert.equal(await next, 'signed');
      assert.equal(tabs.create.callCount, 2);
      assert.equal(openTabs.size, 0);
    });

    it('closes on device rejection or connection failure without retrying the operation', async function () {
      const Keyring = createRemoteKeyring('Trezor Hardware');
      const keyring = new Keyring();
      runtime.sendMessage
        .onFirstCall()
        .resolves({ error: 'User rejected on device' });
      await assert.rejects(
        keyring.signPersonalMessage('address', '0x01'),
        /User rejected on device/u,
      );
      assert.equal(openTabs.size, 0);
      runtime.sendMessage
        .onSecondCall()
        .rejects(new Error('Connection failed'));
      await assert.rejects(keyring.getFirstPage(), /Connection failed/u);
      assert.equal(openTabs.size, 0);
      assert.equal(runtime.sendMessage.callCount, 2);
    });

    it('preserves a successful signature even if closing the tab fails', async function () {
      const Keyring = createRemoteKeyring('Trezor Hardware');
      tabs.remove.onFirstCall().rejects(new Error('No tab with this ID'));
      assert.equal(
        await new Keyring().signPersonalMessage('address', '0x01'),
        'signed',
      );
      assert.equal(tabs.remove.callCount, 1);
      assert.equal(runtime.sendMessage.callCount, 1);
    });

    it('still cancels an in-flight signature when the wallet locks', async function () {
      const started = deferred();
      const result = deferred();
      runtime.sendMessage.callsFake(async ({ state }) => {
        started.resolve();
        await result.promise;
        return { result: 'signed', state };
      });
      const Keyring = createRemoteKeyring('Trezor Hardware');
      const keyring = new Keyring();
      const rejected = assert.rejects(
        keyring.signPersonalMessage('address', '0x01'),
        /wallet was locked/u,
      );
      await started.promise;
      await closeHardwareConnections();
      assert.equal(openTabs.size, 0);
      result.resolve();
      await rejected;
      assert.equal(keyring.isUnlocked(), false);
    });
  });

  it('preserves the transaction fields and chain ID across the message boundary', async function () {
    const privateKey = Buffer.from('1'.repeat(64), 'hex');
    const original = createTransaction(
      {
        nonce: '0x01',
        gasPrice: '0x04a817c800',
        gasLimit: '0x5208',
        to: `0x${'2'.repeat(40)}`,
        value: '0x01',
      },
      1337,
    );
    const Keyring = createRemoteKeyring(
      'Ledger Hardware',
      async ({ method, args, state }) => {
        assert.equal(method, 'signTransaction');
        const data = JSON.parse(JSON.stringify(args[1]));
        const transaction = createTransaction(data, Number(data.chainId));
        assert.equal(Number(transaction.common.chainId()), 1337);
        assert.deepEqual(transaction.raw(), original.raw());
        const signed = transaction.sign(privateKey);
        return {
          result: Buffer.from(signed.serialize()).toString('hex'),
          state,
          unlocked: true,
        };
      },
    );
    const keyring = new Keyring({ accounts: [] });
    const signed = await keyring.signTransaction('address', original);
    assert.equal(Number(signed.common.chainId()), 1337);
    assert.equal(signed.verifySignature(), true);
    assert.equal(keyring.isUnlocked(), true);
  });

  it('keeps account selection and returned public state available for vault persistence', async function () {
    const Keyring = createRemoteKeyring(
      'Trezor Hardware',
      async ({ method, state }) => {
        if (method === 'forgetDevice') {
          return { state: { accounts: [] }, unlocked: false };
        }
        assert.equal(method, 'addAccounts');
        assert.equal(state.unlockedAccount, 7);
        return {
          result: ['0x1234'],
          state: { ...state, accounts: ['0x1234'] },
          unlocked: true,
        };
      },
    );
    const keyring = new Keyring();
    keyring.setAccountToUnlock(7);
    await keyring.addAccounts(1);
    assert.deepEqual(await keyring.getAccounts(), ['0x1234']);
    assert.deepEqual((await keyring.serialize()).accounts, ['0x1234']);
    await keyring.forgetDevice();
    assert.deepEqual(await keyring.getAccounts(), []);
    assert.equal(keyring.isUnlocked(), false);
  });

  it('cancels queued and in-flight requests when the wallet locks', async function () {
    extension.runtime = { getContexts: async () => [], getURL: (path) => path };
    let finish;
    let calls = 0;
    const Keyring = createRemoteKeyring(
      'Ledger Hardware',
      async ({ state }) => {
        calls += 1;
        await new Promise((resolve) => {
          finish = resolve;
        });
        return { state, result: 'signed', unlocked: true };
      },
    );
    try {
      const keyring = new Keyring();
      const first = keyring.signPersonalMessage('address', '0x01');
      const queued = keyring.signPersonalMessage('address', '0x02');
      const firstRejected = assert.rejects(first, /wallet was locked/u);
      const queuedRejected = assert.rejects(queued, /wallet was locked/u);
      await Promise.resolve();
      await closeHardwareConnections();
      finish();
      await Promise.all([firstRejected, queuedRejected]);
      assert.equal(calls, 1);
      assert.equal(keyring.isUnlocked(), false);
    } finally {
      delete extension.runtime;
    }
  });
});
