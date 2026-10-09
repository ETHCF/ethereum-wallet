import { Common, Hardfork } from '@ethereumjs/common-hardware';
import { TransactionFactory } from '@ethereumjs/tx-hardware';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import {
  LedgerKeyring,
  LedgerMobileBridge,
  LedgerTransportMiddleware,
} from '@metamask/eth-ledger-bridge-keyring';
import {
  TrezorKeyring,
  TrezorConnectBridge,
} from '@metamask/eth-trezor-keyring';

import { HARDWARE_KEYRING_METHODS } from './enums';

// The upstream transport bridge also accepts desktop transports. Open only a
// device already authorized by the wallet's Connect button (a user gesture).
export class LedgerWebHIDBridge extends LedgerMobileBridge {
  constructor() {
    super(new LedgerTransportMiddleware());
  }

  async connect() {
    if (this.isDeviceConnected) {
      return;
    }
    if (!(await TransportWebHID.isSupported())) {
      throw new Error(
        'Ledger requires a browser with WebHID support, such as Chrome or Brave.',
      );
    }
    const transport = await TransportWebHID.openConnected();
    if (!transport) {
      throw new Error(
        'Connect and authorize your Ledger in Connect Hardware Wallet, then open its Ethereum app.',
      );
    }
    this.transport = transport;
    transport.on('disconnect', () => {
      this.isDeviceConnected = false;
    });
    await this.updateTransportMethod(transport);
  }

  async destroy() {
    if (this.transport) {
      await super.destroy();
      this.transport = null;
    }
  }
}

export function createHardwareRequestHandler({
  trezor = () => new TrezorKeyring({ bridge: new TrezorConnectBridge() }),
  ledger = () => new LedgerKeyring({ bridge: new LedgerWebHIDBridge() }),
} = {}) {
  const instances = new Map();
  const factories = new Map([
    ['Trezor Hardware', trezor],
    ['Ledger Hardware', ledger],
  ]);
  const methods = new Set(HARDWARE_KEYRING_METHODS);

  return async function performRequest({
    id,
    keyringType,
    method,
    args,
    state,
  }) {
    const factory = factories.get(keyringType);
    if (
      !factory ||
      !methods.has(method) ||
      !Array.isArray(args) ||
      typeof id !== 'string' ||
      !state ||
      !Array.isArray(state.accounts)
    ) {
      throw new Error('Invalid hardware wallet request');
    }
    if (
      method === 'signTransaction' &&
      (!args[1] || ![0, 1, 2].includes(Number(args[1].type || 0)))
    ) {
      throw new Error('Unsupported hardware transaction type');
    }
    if (
      method === 'signTransaction' &&
      keyringType === 'Trezor Hardware' &&
      Number(args[1].type) === 1
    ) {
      throw new Error(
        'Trezor Connect does not support EIP-2930 type 1 transactions',
      );
    }
    let keyring = instances.get(id);
    if (keyring && keyring.type !== keyringType) {
      throw new Error('Hardware wallet type does not match the session');
    }
    if (!keyring) {
      // A restarted background process restores a new keyring ID. Retire the
      // previous session before initializing the singleton SDK/USB connection.
      for (const [previousId, previous] of instances) {
        if (previous.type === keyringType) {
          await previous.destroy();
          instances.delete(previousId);
        }
      }
      keyring = factory();
      await keyring.init();
      instances.set(id, keyring);
    }
    if (method === 'forgetDevice') {
      keyring.forgetDevice();
      await keyring.destroy();
      instances.delete(id);
      return { result: undefined, state: { accounts: [] }, unlocked: false };
    }
    if (keyring.bridge.connect) {
      await keyring.bridge.connect();
    }
    // Pre-0.3 Ledger vaults lack accountDetails. Migrating their legacy paths
    // requires the device's public key; never migrate at vault unlock or drop
    // accounts just because the device is disconnected.
    if (
      keyringType === 'Ledger Hardware' &&
      state.accounts.length &&
      !state.accountDetails
    ) {
      const hdPath = state.legacyHdPath || state.hdPath || "m/44'/60'/0'";
      keyring.setHdPath(hdPath);
      if (hdPath !== "m/44'/60'/0'/0/0") {
        await keyring.unlock();
      }
      await keyring.deserialize({ ...state, hdPath });
      keyring.setHdPath(state.hdPath || hdPath);
    } else {
      if (state.hdPath) {
        keyring.setHdPath(state.hdPath);
      }
      await keyring.deserialize(state);
    }
    const accounts = await keyring.getAccounts();
    if (
      state.accounts.some(
        (account) =>
          !accounts.some(
            (restored) => restored.toLowerCase() === account.toLowerCase(),
          ),
      )
    ) {
      throw new Error(
        'Unable to restore hardware account paths. Reconnect the original device.',
      );
    }
    if (state.page !== undefined) {
      keyring.page = state.page;
    }
    if (state.unlockedAccount !== undefined) {
      keyring.setAccountToUnlock(Number(state.unlockedAccount));
    }
    let callArgs = args;
    if (method === 'signTransaction') {
      // The type was checked when the request arrived.
      const params = args[1];
      const type = Number(params.type || 0);
      const tx = TransactionFactory.fromTxData(
        { ...params, type },
        {
          common: Common.custom(
            { chainId: Number(params.chainId) },
            { hardfork: Hardfork.London },
          ),
        },
      );
      callArgs = [args[0], tx];
    }
    let result = await keyring[method](...callArgs);
    if (method === 'signTransaction') {
      result = Buffer.from(result.serialize()).toString('hex');
    }
    return {
      result,
      state: {
        ...(await keyring.serialize()),
        page: keyring.page,
        unlockedAccount: keyring.unlockedAccount,
      },
      unlocked: keyring.isUnlocked(),
    };
  };
}
