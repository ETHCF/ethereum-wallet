import { EventEmitter } from 'events';
import log from 'loglevel';

import { HARDWARE_KEYRING_METHODS } from './enums';
import extension from './extension-api';
import { transactionData, decodeTransaction } from './transaction-codec';

let creatingTab;
let closingTab;
let activeRequests = 0;
let closeWhenIdle = false;
let connectionGeneration = 0;
const completedMethods = new Set([
  'addAccounts',
  'signTransaction',
  'signPersonalMessage',
  'signTypedData',
  'exportAccount',
  'forgetDevice',
]);

function lockedError() {
  return new Error(
    'Hardware wallet request cancelled because the wallet was locked.',
  );
}

async function openTransportTab() {
  const url = extension.runtime.getURL('hardware.html');
  const contexts = await extension.runtime.getContexts({
    contextTypes: ['TAB'],
    documentUrls: [url],
  });
  const tab = contexts.length
    ? await extension.tabs.get(contexts[0].tabId)
    : await extension.tabs.create({ url, active: false });
  if (tab.status === 'complete') {
    return;
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error('Hardware wallet connection tab did not load. Please retry.'),
      );
    }, 30000);
    function cleanup() {
      extension.tabs.onUpdated.removeListener(updated);
      extension.tabs.onRemoved.removeListener(removed);
      clearTimeout(timeout);
    }
    function updated(id, info) {
      if (id === tab.id && info.status === 'complete') {
        cleanup();
        resolve();
      }
    }
    function removed(id) {
      if (id === tab.id) {
        cleanup();
        reject(
          new Error('Hardware wallet connection tab was closed. Please retry.'),
        );
      }
    }
    extension.tabs.onUpdated.addListener(updated);
    extension.tabs.onRemoved.addListener(removed);
    // Cover completion between tabs.create and listener registration.
    // eslint-disable-next-line promise/catch-or-return -- the rejection handler is the second argument to then()
    extension.tabs.get(tab.id).then(
      (current) => updated(tab.id, current),
      () => removed(tab.id),
    );
  });
}

async function requestHardware(request) {
  const generation = connectionGeneration;
  activeRequests += 1;
  try {
    // A new request must not reuse a tab that is still being removed.
    await closingTab;
    if (generation !== connectionGeneration) {
      throw lockedError();
    }
    if (!creatingTab) {
      creatingTab = openTransportTab().finally(() => {
        creatingTab = null;
      });
    }
    await creatingTab;
    if (generation !== connectionGeneration) {
      throw lockedError();
    }
    const response = await extension.runtime.sendMessage({
      type: 'ecf-wallet-hardware-request',
      ...request,
    });
    if (!response || response.error) {
      throw new Error(
        response?.error ||
          'Hardware wallet transport disconnected. Please retry.',
      );
    }
    // Keep account discovery alive until the user imports an account. Signing
    // and other completed operations release the shared tab once it is idle.
    closeWhenIdle = closeWhenIdle || completedMethods.has(request.method);
    return response;
  } catch (error) {
    closeWhenIdle = true;
    throw error;
  } finally {
    activeRequests -= 1;
    if (!activeRequests && closeWhenIdle) {
      closeWhenIdle = false;
      // A cleanup error must never turn a completed signature into a failure.
      await closeTransportTabs().catch((error) =>
        log.warn('Unable to close hardware wallet connection tab', error),
      );
    }
  }
}

function closeTransportTabs() {
  if (!closingTab) {
    closingTab = (async () => {
      if (creatingTab) {
        await creatingTab.catch(() => undefined);
      }
      const contexts = await extension.runtime.getContexts({
        contextTypes: ['TAB'],
        documentUrls: [extension.runtime.getURL('hardware.html')],
      });
      await Promise.all(
        contexts.map((context) => extension.tabs.remove(context.tabId)),
      );
    })().finally(() => {
      closingTab = null;
    });
  }
  return closingTab;
}

export async function closeHardwareConnections() {
  connectionGeneration += 1;
  await closeTransportTabs();
}

export function createRemoteKeyring(type, send = requestHardware) {
  class RemoteKeyring extends EventEmitter {
    constructor(opts = {}) {
      super();
      this.type = type;
      this.id = global.crypto.randomUUID();
      this.queue = Promise.resolve();
      this.generation = connectionGeneration;
      this.stateRevision = 0;
      this.settingRevisions = {};
      this.removedAccounts = new Map();
      // The device's extended public key, held in memory only (never in the
      // vault) and so discarded on lock. Without it, each new connection tab
      // must ask the user to export the public key again before signing.
      this.publicKey = null;
      this.deserialize(opts);
    }

    async serialize() {
      return JSON.parse(JSON.stringify(this.state));
    }

    async deserialize(opts = {}) {
      this.state = { ...opts, accounts: opts.accounts || [] };
    }

    async getAccounts() {
      return this.state.accounts.slice();
    }

    isUnlocked() {
      return Boolean(this.unlocked);
    }

    setAccountToUnlock(index) {
      this.state.unlockedAccount = Number(index);
      this.stateRevision += 1;
      this.settingRevisions.unlockedAccount = this.stateRevision;
    }

    setHdPath(hdPath) {
      if (
        type === 'Ledger Hardware' &&
        this.state.accounts.length &&
        !this.state.accountDetails
      ) {
        this.state.legacyHdPath = this.state.legacyHdPath || this.state.hdPath;
      }
      this.state.hdPath = hdPath;
      this.stateRevision += 1;
      this.settingRevisions.hdPath = this.stateRevision;
      this.settingRevisions.legacyHdPath = this.stateRevision;
    }

    removeAccount(address) {
      this.state.accounts = this.state.accounts.filter(
        (account) => account.toLowerCase() !== address.toLowerCase(),
      );
      this.stateRevision += 1;
      this.removedAccounts.set(address.toLowerCase(), this.stateRevision);
    }

    async forgetDevice() {
      await this.call('forgetDevice', []);
      this.id = global.crypto.randomUUID();
      this.state = { accounts: [] };
      this.unlocked = false;
    }

    async call(method, args) {
      const revision = this.stateRevision;
      // Freeze user-selected settings when enqueued, while still carrying public
      // account state returned by earlier operations in the same queue.
      const settings = {};
      for (const field of ['hdPath', 'legacyHdPath', 'unlockedAccount']) {
        settings[field] = this.state[field];
      }
      const operation = this.queue.then(async () => {
        if (this.generation !== connectionGeneration) {
          throw lockedError();
        }
        const state = JSON.parse(
          JSON.stringify({ ...this.state, ...settings }),
        );
        const response = await send({
          id: this.id,
          keyringType: type,
          method,
          args,
          state,
          publicKey: this.publicKey,
          network: this.network,
        });
        if (this.generation !== connectionGeneration) {
          throw lockedError();
        }
        const updated = { ...response.state };
        for (const [field, changedAt] of Object.entries(
          this.settingRevisions,
        )) {
          if (changedAt > revision) {
            updated[field] = this.state[field];
          }
        }
        updated.accounts = updated.accounts.filter(
          (account) =>
            !(this.removedAccounts.get(account.toLowerCase()) > revision),
        );
        this.state = updated;
        this.unlocked = response.unlocked;
        this.publicKey = response.publicKey || null;
        return response.result;
      });
      this.queue = operation.catch(() => undefined);
      return operation;
    }

    async signTransaction(address, tx) {
      if (type === 'Trezor Hardware' && Number(tx.type) === 1) {
        throw new Error(
          'Trezor Connect does not support EIP-2930 type 1 transactions. Use an EIP-1559 transaction with an access list.',
        );
      }
      if (Number(tx.type) === 4) {
        throw new Error(
          'EIP-7702 signing is supported only by software accounts.',
        );
      }
      const data = transactionData(tx);
      const signed = await this.call('signTransaction', [address, data]);
      return decodeTransaction(signed, Number(data.chainId));
    }
  }
  // Forward the transport methods the class does not implement itself.
  for (const method of HARDWARE_KEYRING_METHODS.filter(
    (name) => !Object.hasOwn(RemoteKeyring.prototype, name),
  )) {
    RemoteKeyring.prototype[method] = function (...args) {
      return this.call(method, args);
    };
  }
  RemoteKeyring.type = type;
  return RemoteKeyring;
}

// Keep DOM-only SDKs out of both browsers' background bundles. The connection
// tab supplies the tabs/windows APIs that Trezor Connect needs under MV3.
export const Trezor = createRemoteKeyring('Trezor Hardware');
export const Ledger = createRemoteKeyring('Ledger Hardware');
