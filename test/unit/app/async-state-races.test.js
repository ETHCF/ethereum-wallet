import { encode as abiEncode } from '@metamask/abi-utils';
import { ObservableStore } from '@metamask/obs-store';
import { strict as assert } from 'assert';
import BN from 'bn.js';
import { EventEmitter } from 'events';

import CachedBalancesController from '../../../app/scripts/controllers/cached-balances';
import WalletController from '../../../app/scripts/ecf-wallet-controller';
import AccountTracker from '../../../app/scripts/lib/account-tracker';
import { createRemoteKeyring } from '../../../app/scripts/lib/hardware-keyrings';
import NotificationManager from '../../../app/scripts/lib/notification-manager';
import TypedMessageManager from '../../../app/scripts/lib/typed-message-manager';

function deferred() {
  let resolve;
  const promise = new Promise((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const address = `0x${'1'.repeat(40)}`;

describe('Asynchronous state races', function () {
  it('keeps the original typed-signature request alive when another UI approves it again', async function () {
    const manager = new TypedMessageManager({
      getChainId: () => '0x1',
    });
    let settled = false;
    const response = manager
      .addUnapprovedMessageAsync(
        {
          from: address,
          data: {
            types: {
              EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
              Test: [{ name: 'text', type: 'string' }],
            },
            primaryType: 'Test',
            domain: { chainId: 1 },
            message: { text: 'test' },
          },
        },
        { origin: 'https://example.test' },
        'V4',
      )
      .then(
        (signature) => {
          settled = true;
          return { signature };
        },
        (error) => {
          settled = true;
          return { error };
        },
      );
    const { id } = manager.messages[0];
    const started = deferred();
    const finish = deferred();
    let calls = 0;
    const controller = {
      typedMessageManager: manager,
      keyringController: {
        signTypedMessage: async () => {
          calls += 1;
          started.resolve();
          await finish.promise;
          return 'signature';
        },
      },
      getState: () => ({}),
    };
    const approve = () =>
      WalletController.prototype.signTypedMessage.call(controller, {
        ecfWalletId: id,
      });
    const first = approve();
    await started.promise;
    await assert.rejects(approve(), /not awaiting approval/u);
    assert.equal(settled, false);
    finish.resolve();
    await first;
    assert.deepEqual(await response, { signature: 'signature' });
    assert.equal(calls, 1);
  });

  it('coalesces popup creation and permits a new attempt after a failed creation', async function () {
    const manager = new NotificationManager();
    const finish = deferred();
    let opened = 0;
    manager.platform = {
      getAllWindows: async () => [],
      getLastFocusedWindow: async () => ({}),
      openWindow: async () => {
        opened += 1;
        await finish.promise;
        throw new Error('Window creation failed');
      },
    };
    const first = assert.rejects(
      manager.showPopup(),
      /Window creation failed/u,
    );
    const second = assert.rejects(
      manager.showPopup(),
      /Window creation failed/u,
    );
    await flush();
    assert.equal(opened, 1);
    finish.resolve();
    await Promise.all([first, second]);
    manager.platform.openWindow = async () => {
      opened += 1;
      return { id: 7 };
    };
    await Promise.all([manager.showPopup(), manager.showPopup()]);
    assert.equal(opened, 2);
    assert.equal(manager._popupId, 7);
  });

  it('preserves each queued hardware selection and later local settings across stale responses', async function () {
    const started = deferred();
    const finish = deferred();
    let imported;
    const Keyring = createRemoteKeyring(
      'Trezor Hardware',
      async ({ method, state }) => {
        if (method === 'getFirstPage') {
          started.resolve();
          await finish.promise;
        } else {
          imported = state.unlockedAccount;
        }
        return { result: [], state, unlocked: true };
      },
    );
    const keyring = new Keyring({
      accounts: [],
      unlockedAccount: 0,
      hdPath: 'old path',
    });
    const page = keyring.getFirstPage();
    await started.promise;
    keyring.setAccountToUnlock(7);
    const importing = keyring.addAccounts(1);
    keyring.setAccountToUnlock(8);
    keyring.setHdPath('new path');
    finish.resolve();
    await Promise.all([page, importing]);
    assert.equal(imported, 7);
    const state = await keyring.serialize();
    assert.equal(state.unlockedAccount, 8);
    assert.equal(state.hdPath, 'new path');
  });

  it('does not resurrect a hardware account removed during an operation', async function () {
    const started = deferred();
    const finish = deferred();
    const Keyring = createRemoteKeyring(
      'Trezor Hardware',
      async ({ state }) => {
        started.resolve();
        await finish.promise;
        return { state, result: 'signature' };
      },
    );
    const keyring = new Keyring({ accounts: [address] });
    const signing = keyring.signPersonalMessage(address, '0x01');
    await started.promise;
    keyring.removeAccount(address);
    finish.resolve();
    await signing;
    assert.deepEqual(await keyring.getAccounts(), []);
  });

  function balances() {
    const network = new EventEmitter();
    network.id = '100';
    network.getNetworkState = () => network.id;
    const blockTracker = new EventEmitter();
    blockTracker.getCurrentBlock = () => null;
    blockTracker.getLatestBlock = () => new Promise(() => undefined);
    const tracker = new AccountTracker({
      network,
      blockTracker,
      provider: { sendAsync: () => undefined },
    });
    tracker.addAccounts([address]);
    const cache = new CachedBalancesController({
      accountTracker: tracker,
      getNetwork: () => network.id,
    });
    return { network, tracker, cache };
  }

  it('logs a failed background balance update instead of leaving it unhandled', async function () {
    const { tracker } = balances();
    tracker._query = {
      getBalance: async () => {
        throw new Error('RPC unavailable');
      },
    };
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      tracker.refresh();
      await flush();
      await flush();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    assert.deepEqual(unhandled, []);
  });

  it('discards old-chain balances, including a switch away and back to the same chain', async function () {
    const { network, tracker, cache } = balances();
    const old = deferred();
    tracker._query = { getBalance: () => old.promise };
    const pending = tracker._updateAccount(address);
    network.id = '200';
    network.emit('networkDidChange');
    tracker._query = { getBalance: async () => '0xbb' };
    await tracker._updateAccount(address);
    await flush();
    old.resolve('0xaa');
    await pending;
    await flush();
    assert.equal(tracker.store.getState().accounts[address].balance, '0xbb');
    assert.equal(cache.store.getState().cachedBalances['200'][address], '0xbb');

    const older = deferred();
    tracker._query = { getBalance: () => older.promise };
    const stale = tracker._updateAccount(address);
    network.id = '100';
    network.emit('networkDidChange');
    network.id = '200';
    network.emit('networkDidChange');
    older.resolve('0xcc');
    await stale;
    assert.equal(tracker.store.getState().accounts[address].balance, undefined);
  });

  it('discards stale batch balances and does not resurrect removed accounts', async function () {
    const { network, tracker } = balances();
    const replies = [];
    const encode = (value) =>
      `0x${Buffer.from(abiEncode(['uint256[]'], [[value.toString(10)]])).toString('hex')}`;
    tracker._query = {
      call: () =>
        new Promise((resolve) =>
          replies.push((_, [value]) => resolve(encode(value))),
        ),
    };
    const old = tracker._updateAccountsViaBalanceChecker([address], 'contract');
    network.id = '200';
    network.emit('networkDidChange');
    const latest = tracker._updateAccountsViaBalanceChecker(
      [address],
      'contract',
    );
    replies[1](null, [new BN(187)]);
    await latest;
    replies[0](null, [new BN(170)]);
    await old;
    assert.equal(tracker.store.getState().accounts[address].balance, '0xbb');
    const removed = tracker._updateAccountsViaBalanceChecker(
      [address],
      'contract',
    );
    tracker.removeAccount([address]);
    replies[2](null, [new BN(1)]);
    await removed;
    assert.deepEqual(tracker.store.getState().accounts, {});
  });

  it('retains both networks when balance cache updates overlap', async function () {
    const tracker = { store: new ObservableStore({}) };
    let network = '100';
    const cache = new CachedBalancesController({
      accountTracker: tracker,
      getNetwork: () => network,
    });
    const first = cache.updateCachedBalances({
      accounts: { [address]: { balance: '0xaa' } },
    });
    network = '200';
    const second = cache.updateCachedBalances({
      accounts: { [address]: { balance: '0xbb' } },
    });
    await Promise.all([first, second]);
    assert.deepEqual(cache.store.getState().cachedBalances, {
      100: { [address]: '0xaa' },
      200: { [address]: '0xbb' },
    });
  });

  it('does not repopulate a cleared balance cache from a pending update', async function () {
    const finish = deferred();
    const cache = new CachedBalancesController({
      accountTracker: { store: new ObservableStore({}) },
      getNetwork: () => finish.promise,
    });
    const update = cache.updateCachedBalances({
      accounts: { [address]: { balance: '0xaa' } },
    });
    cache.clearCachedBalances();
    finish.resolve('100');
    await update;
    assert.deepEqual(cache.store.getState().cachedBalances, {});
  });
});
