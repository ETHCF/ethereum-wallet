import EthQuery from '@metamask/eth-query';
import assert from 'assert';
import { cloneDeep } from 'lodash';
import proxyquire from 'proxyquire';
import sinon from 'sinon';
import { Duplex, PassThrough } from 'stream';
import { objectTransform as createThoughStream } from 'through2';
import { promisify } from 'util';

import metaRPCClientFactory from '../../../../app/scripts/lib/metaRPCClientFactory';
import firstTimeState from '../../localhostState';

// browser.storage.session, in memory
const sessionStorageMock = {
  items: {},
  async get(key) {
    return Object.hasOwn(this.items, key) ? { [key]: this.items[key] } : {};
  },
  async set(items) {
    Object.assign(this.items, items);
  },
  async remove(key) {
    delete this.items[key];
  },
};

const ExtensionApiMock = {
  runtime: {
    id: 'fake-extension-id',
    getURL: (path) => `chrome-extension://fake-extension-id/${path}`,
  },
  storage: { session: sessionStorageMock },
  tabs: { update: async () => undefined },
};

let loggerMiddlewareMock;
const initializeMockMiddlewareLog = () => {
  loggerMiddlewareMock = {
    requests: [],
    responses: [],
  };
};
const tearDownMockMiddlewareLog = () => {
  loggerMiddlewareMock = undefined;
};

const createLoggerMiddlewareMock = () => (req, res, next) => {
  if (loggerMiddlewareMock) {
    loggerMiddlewareMock.requests.push(req);
    next((cb) => {
      loggerMiddlewareMock.responses.push(res);
      cb();
    });
    return;
  }
  next();
};

const { default: EcfWalletController, MAX_RESTORED_ACCOUNTS } = proxyquire(
  '../../../../app/scripts/ecf-wallet-controller',
  {
    './lib/extension-api': { default: ExtensionApiMock },
    './lib/createLoggerMiddleware': { default: createLoggerMiddlewareMock },
  },
);

const DEFAULT_LABEL = 'Account 1';
const DEFAULT_LABEL_2 = 'Account 2';
const TEST_SEED =
  'debris dizzy just program just float decrease vacant alarm reduce speak stadium';
const TEST_ADDRESS = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc';
const TEST_ADDRESS_2 = '0xec1adf982415d2ef5ec55899b9bfb8bc0f29251b';
const TEST_ADDRESS_3 = '0xeb9e64b93097bc15f01f13eae97015c57ab64823';
const TEST_SEED_ALT =
  'setup olympic issue mobile velvet surge alcohol burger horse view reopen gentle';
const TEST_ADDRESS_ALT = '0xc42edfcc21ed14dda456aa0756c153f7985d8813';
const CUSTOM_RPC_URL = 'http://localhost:8545';

describe('EcfWalletController', function () {
  let ecfWalletController;
  const sandbox = sinon.createSandbox();
  const noop = () => undefined;

  beforeEach(function () {
    ecfWalletController = new EcfWalletController({
      showUnapprovedTx: noop,
      showUnconfirmedMessage: noop,
      encryptor: {
        encrypt(_, object) {
          this.object = object;
          return Promise.resolve('mock-encrypted');
        },
        decrypt() {
          return Promise.resolve(this.object);
        },
      },
      initState: cloneDeep(firstTimeState),
      platform: {
        showTransactionNotification: () => undefined,
        getVersion: () => 'foo',
      },
    });
    // add sinon method spies
    sandbox.spy(
      ecfWalletController.keyringController,
      'createNewVaultAndKeychain',
    );
    sandbox.spy(
      ecfWalletController.keyringController,
      'createNewVaultAndRestore',
    );
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('#getAccounts', function () {
    it('returns first address when dapp calls web3.eth.getAccounts', async function () {
      const password = 'a-fake-password';
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED);

      ecfWalletController.networkController._baseProviderParams.getAccounts(
        (err, res) => {
          assert.ifError(err);
          assert.equal(res.length, 1);
          assert.equal(res[0], '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc');
        },
      );
    });
  });

  describe('#importAccountWithStrategy', function () {
    const importPrivkey =
      '4cfd3e90fc78b0f86bf7524722150bb8da9c60cd532564d7ff43f5716514f553';

    it('adds private key to keyrings in KeyringController', async function () {
      const password = 'a-fake-password';
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED);
      await ecfWalletController.importAccountWithStrategy('Private Key', [
        importPrivkey,
      ]);

      const simpleKeyrings =
        ecfWalletController.keyringController.getKeyringsByType(
          'Simple Key Pair',
        );
      const [address] = await simpleKeyrings[0].getAccounts();
      assert.equal(address, '0xe18035bf8712672935fdb4e5e431b1a0183d2dfc');
      assert.equal(
        await simpleKeyrings[0].exportAccount(address),
        importPrivkey,
      );
      const keyringAccounts =
        await ecfWalletController.keyringController.getAccounts();
      assert.equal(
        keyringAccounts[keyringAccounts.length - 1],
        '0xe18035bf8712672935fdb4e5e431b1a0183d2dfc',
      );
    });
  });

  describe('submitPassword', function () {
    const password = 'password';

    it('removes any identities that do not correspond to known accounts.', async function () {
      await ecfWalletController.createNewVaultAndKeychain(password);
      const fakeAddress = '0xbad0';
      ecfWalletController.preferencesController.addAddresses([fakeAddress]);
      await ecfWalletController.submitPassword(password);

      const identities = Object.keys(
        ecfWalletController.preferencesController.store.getState().identities,
      );
      const addresses =
        await ecfWalletController.keyringController.getAccounts();

      identities.forEach((identity) => {
        assert.ok(
          addresses.includes(identity),
          `addresses should include all IDs: ${identity}`,
        );
      });

      addresses.forEach((address) => {
        assert.ok(
          identities.includes(address),
          `identities should include all Addresses: ${address}`,
        );
      });
    });

    it('unlocks without waiting for a network that does not answer', async function () {
      await ecfWalletController.createNewVaultAndKeychain(password);
      await ecfWalletController.setLocked();
      sandbox
        .stub(ecfWalletController.blockTracker, 'checkForLatestBlock')
        .returns(new Promise(() => undefined));

      await ecfWalletController.submitPassword(password);

      assert.ok(ecfWalletController.isUnlocked());
    });
  });

  describe('#createNewVaultAndKeychain', function () {
    it('can only create new vault on keyringController once', async function () {
      const selectStub = sandbox.stub(
        ecfWalletController,
        'selectFirstIdentity',
      );

      const password = 'a-fake-password';

      await ecfWalletController.createNewVaultAndKeychain(password);
      await ecfWalletController.createNewVaultAndKeychain(password);

      assert(
        ecfWalletController.keyringController.createNewVaultAndKeychain
          .calledOnce,
      );

      selectStub.reset();
    });
  });

  describe('secrets need the password', function () {
    const password = 'a-fake-password';

    beforeEach(async function () {
      sandbox.stub(ecfWalletController, 'getBalance').resolves('0x0');
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED);
      sandbox
        .stub(ecfWalletController.keyringController, 'verifyPassword')
        .callsFake(async (attempt) => {
          if (attempt !== password) {
            throw new Error('Incorrect password');
          }
        });
    });

    it('returns the seed phrase only with the password', async function () {
      assert.equal(await ecfWalletController.verifySeedPhrase(), undefined);
      await assert.rejects(ecfWalletController.getSeedPhrase('wrong'), {
        message: 'Incorrect password.',
      });
      assert.equal(
        await ecfWalletController.getSeedPhrase(password),
        TEST_SEED,
      );
    });

    it('exports a private key only with the password', async function () {
      const [address] =
        await ecfWalletController.keyringController.getAccounts();
      await assert.rejects(ecfWalletController.exportAccount(address), {
        message: 'Incorrect password.',
      });
      await assert.rejects(
        ecfWalletController.exportAccount(address, 'wrong'),
        {
          message: 'Incorrect password.',
        },
      );
      assert.match(
        await ecfWalletController.exportAccount(address, password),
        /^(0x)?[0-9a-f]{64}$/u,
      );
    });

    it('does not replace a locked vault with a new one', async function () {
      const { vault } = ecfWalletController.keyringController.store.getState();
      await ecfWalletController.setLocked();
      await assert.rejects(
        ecfWalletController.createNewVaultAndKeychain('another-password'),
        /a vault already exists/u,
      );
      assert.equal(
        ecfWalletController.keyringController.store.getState().vault,
        vault,
      );
    });
  });

  describe('#createNewVaultAndRestore', function () {
    it('should be able to call newVaultAndRestore despite a mistake.', async function () {
      const password = 'what-what-what';
      sandbox.stub(ecfWalletController, 'getBalance');
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0');
      });

      await assert.rejects(
        ecfWalletController.createNewVaultAndRestore(
          password,
          TEST_SEED.slice(0, -1),
        ),
      );
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED);

      assert(
        ecfWalletController.keyringController.createNewVaultAndRestore
          .calledOnce,
      );
      assert.equal(ecfWalletController.isUnlocked(), true);
    });

    it('should clear previous identities after vault restoration', async function () {
      sandbox.stub(ecfWalletController, 'getBalance');
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0');
      });

      let startTime = Date.now();
      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED,
      );
      let endTime = Date.now();

      const firstVaultIdentities = cloneDeep(
        ecfWalletController.getState().identities,
      );
      assert.ok(
        firstVaultIdentities[TEST_ADDRESS].lastSelected >= startTime &&
          firstVaultIdentities[TEST_ADDRESS].lastSelected <= endTime,
        `'${firstVaultIdentities[TEST_ADDRESS].lastSelected}' expected to be between '${startTime}' and '${endTime}'`,
      );
      delete firstVaultIdentities[TEST_ADDRESS].lastSelected;
      assert.deepEqual(firstVaultIdentities, {
        [TEST_ADDRESS]: { address: TEST_ADDRESS, name: DEFAULT_LABEL },
      });

      await ecfWalletController.preferencesController.setAccountLabel(
        TEST_ADDRESS,
        'Account Foo',
      );

      const labelledFirstVaultIdentities = cloneDeep(
        ecfWalletController.getState().identities,
      );
      delete labelledFirstVaultIdentities[TEST_ADDRESS].lastSelected;
      assert.deepEqual(labelledFirstVaultIdentities, {
        [TEST_ADDRESS]: { address: TEST_ADDRESS, name: 'Account Foo' },
      });

      startTime = Date.now();
      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED_ALT,
      );
      endTime = Date.now();

      const secondVaultIdentities = cloneDeep(
        ecfWalletController.getState().identities,
      );
      assert.ok(
        secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected >= startTime &&
          secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected <= endTime,
        `'${secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected}' expected to be between '${startTime}' and '${endTime}'`,
      );
      delete secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected;
      assert.deepEqual(secondVaultIdentities, {
        [TEST_ADDRESS_ALT]: { address: TEST_ADDRESS_ALT, name: DEFAULT_LABEL },
      });
    });

    it('keeps account names and site connections when the seed phrase is invalid', async function () {
      sandbox.stub(ecfWalletController, 'getBalance').resolves('0x0');
      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED,
      );
      await ecfWalletController.preferencesController.setAccountLabel(
        TEST_ADDRESS,
        'Account Foo',
      );
      const clearPermissions = sandbox.spy(
        ecfWalletController.permissionsController,
        'clearPermissions',
      );

      await assert.rejects(
        ecfWalletController.createNewVaultAndRestore(
          'foobar1337',
          TEST_SEED.slice(0, -1),
        ),
        { message: 'Seed phrase is invalid.' },
      );
      assert.equal(
        ecfWalletController.getState().identities[TEST_ADDRESS].name,
        'Account Foo',
      );
      assert.equal(clearPermissions.callCount, 0);
    });

    it('stops adding accounts at a limit when every account reports a balance', async function () {
      sandbox.stub(ecfWalletController, 'getBalance').resolves('0x1');
      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED,
      );
      assert.equal(
        Object.keys(ecfWalletController.getState().identities).length,
        MAX_RESTORED_ACCOUNTS,
      );
    });

    it('finishes the restore with the accounts found when the network fails', async function () {
      const getBalance = sandbox.stub(ecfWalletController, 'getBalance');
      getBalance.withArgs(TEST_ADDRESS).resolves('0x1');
      getBalance.withArgs(TEST_ADDRESS_2).rejects(new Error('RPC unavailable'));
      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED,
      );
      assert.deepEqual(
        Object.keys(ecfWalletController.getState().identities).sort(),
        [TEST_ADDRESS, TEST_ADDRESS_2].sort(),
      );
      assert.equal(ecfWalletController.isUnlocked(), true);
    });

    it('should restore any consecutive accounts with balances', async function () {
      sandbox.stub(ecfWalletController, 'getBalance');
      ecfWalletController.getBalance.withArgs(TEST_ADDRESS).callsFake(() => {
        return Promise.resolve('0x14ced5122ce0a000');
      });
      ecfWalletController.getBalance.withArgs(TEST_ADDRESS_2).callsFake(() => {
        return Promise.resolve('0x0');
      });
      ecfWalletController.getBalance.withArgs(TEST_ADDRESS_3).callsFake(() => {
        return Promise.resolve('0x14ced5122ce0a000');
      });

      const startTime = Date.now();
      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED,
      );

      const identities = cloneDeep(ecfWalletController.getState().identities);
      assert.ok(
        identities[TEST_ADDRESS].lastSelected >= startTime &&
          identities[TEST_ADDRESS].lastSelected <= Date.now(),
      );
      delete identities[TEST_ADDRESS].lastSelected;
      assert.deepEqual(identities, {
        [TEST_ADDRESS]: { address: TEST_ADDRESS, name: DEFAULT_LABEL },
        [TEST_ADDRESS_2]: { address: TEST_ADDRESS_2, name: DEFAULT_LABEL_2 },
      });
    });
  });

  describe('#getBalance', function () {
    it('should return the balance known by accountTracker', async function () {
      const accounts = {};
      const balance = '0x14ced5122ce0a000';
      accounts[TEST_ADDRESS] = { balance };

      ecfWalletController.accountTracker.store.putState({ accounts });

      const gotten = await ecfWalletController.getBalance(TEST_ADDRESS);

      assert.equal(balance, gotten);
    });

    it('should ask the network for a balance when not known by accountTracker', async function () {
      const accounts = {};
      const balance = '0x14ced5122ce0a000';
      const ethQuery = new EthQuery();
      sinon.stub(ethQuery, 'getBalance').callsFake((_, callback) => {
        callback(undefined, balance);
      });

      ecfWalletController.accountTracker.store.putState({ accounts });

      const gotten = await ecfWalletController.getBalance(
        TEST_ADDRESS,
        ethQuery,
      );

      assert.equal(balance, gotten);
    });
  });

  describe('#getApi', function () {
    it('getState', function (done) {
      let state;
      const getApi = ecfWalletController.getApi();
      getApi.getState((err, res) => {
        if (err) {
          done(err);
        } else {
          state = res;
        }
      });
      assert.deepEqual(state, ecfWalletController.getState());
      done();
    });
  });

  describe('#selectFirstIdentity', function () {
    let identities, address;

    beforeEach(function () {
      address = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc';
      identities = {
        '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc': {
          address,
          name: 'Account 1',
        },
        '0xc42edfcc21ed14dda456aa0756c153f7985d8813': {
          address: '0xc42edfcc21ed14dda456aa0756c153f7985d8813',
          name: 'Account 2',
        },
      };
      ecfWalletController.preferencesController.store.updateState({
        identities,
      });
      ecfWalletController.selectFirstIdentity();
    });

    it('changes preferences controller select address', function () {
      const preferenceControllerState =
        ecfWalletController.preferencesController.store.getState();
      assert.equal(preferenceControllerState.selectedAddress, address);
    });

    it('changes ecf-wallet controller selected address', function () {
      const ecfWalletState = ecfWalletController.getState();
      assert.equal(ecfWalletState.selectedAddress, address);
    });
  });

  describe('connectHardware', function () {
    it('should throw if it receives an unknown device name', async function () {
      await assert.rejects(
        ecfWalletController.connectHardware(
          'Some random device name',
          0,
          `m/44/0'/0'`,
        ),
        { message: 'EcfWalletController:getKeyringForDevice - Unknown device' },
      );
    });

    it('should add the Trezor Hardware keyring', async function () {
      sinon.spy(ecfWalletController.keyringController, 'addNewKeyring');
      await ecfWalletController.connectHardware('trezor', 0).catch(() => null);
      const keyrings =
        await ecfWalletController.keyringController.getKeyringsByType(
          'Trezor Hardware',
        );
      assert.equal(
        ecfWalletController.keyringController.addNewKeyring.getCall(0).args,
        'Trezor Hardware',
      );
      assert.equal(keyrings.length, 1);
    });

    it('should add the Ledger Hardware keyring', async function () {
      sinon.spy(ecfWalletController.keyringController, 'addNewKeyring');
      await ecfWalletController.connectHardware('ledger', 0).catch(() => null);
      const keyrings =
        await ecfWalletController.keyringController.getKeyringsByType(
          'Ledger Hardware',
        );
      assert.equal(
        ecfWalletController.keyringController.addNewKeyring.getCall(0).args,
        'Ledger Hardware',
      );
      assert.equal(keyrings.length, 1);
    });
  });

  describe('checkHardwareStatus', function () {
    it('should throw if it receives an unknown device name', async function () {
      await assert.rejects(
        ecfWalletController.checkHardwareStatus(
          'Some random device name',
          `m/44/0'/0'`,
        ),
        { message: 'EcfWalletController:getKeyringForDevice - Unknown device' },
      );
    });

    it('should be locked by default', async function () {
      await ecfWalletController.connectHardware('trezor', 0).catch(() => null);
      const status = await ecfWalletController.checkHardwareStatus('trezor');
      assert.equal(status, false);
    });
  });

  describe('forgetDevice', function () {
    it('should throw if it receives an unknown device name', async function () {
      await assert.rejects(
        ecfWalletController.forgetDevice('Some random device name'),
        { message: 'EcfWalletController:getKeyringForDevice - Unknown device' },
      );
    });

    it('should wipe all the keyring info', async function () {
      await ecfWalletController.connectHardware('trezor', 0).catch(() => null);
      const keyring = await ecfWalletController.getKeyringForDevice('trezor');
      const call = sinon.stub(keyring, 'call').resolves();
      await ecfWalletController.forgetDevice('trezor');
      assert.equal(call.calledWithExactly('forgetDevice', []), true);
      const keyrings =
        await ecfWalletController.keyringController.getKeyringsByType(
          'Trezor Hardware',
        );

      assert.deepEqual(await keyrings[0].getAccounts(), []);
      assert.deepEqual(await keyrings[0].serialize(), { accounts: [] });
      assert.deepEqual(keyrings[0].isUnlocked(), false);
    });
  });

  describe('unlockHardwareWalletAccount', function () {
    let accountToUnlock;
    let windowOpenStub;
    let addNewAccountStub;
    let getAccountsStub;

    beforeEach(async function () {
      accountToUnlock = 10;
      windowOpenStub = sinon.stub(window, 'open');
      windowOpenStub.returns(noop);

      addNewAccountStub = sinon.stub(
        ecfWalletController.keyringController,
        'addNewAccount',
      );
      addNewAccountStub.returns({});

      getAccountsStub = sinon.stub(
        ecfWalletController.keyringController,
        'getAccounts',
      );
      // Need to return different address to mock the behavior of
      // adding a new account from the keyring
      getAccountsStub.onCall(0).returns(Promise.resolve(['0x1']));
      getAccountsStub.onCall(1).returns(Promise.resolve(['0x2']));
      getAccountsStub.onCall(2).returns(Promise.resolve(['0x3']));
      getAccountsStub.onCall(3).returns(Promise.resolve(['0x4']));
      sinon.spy(ecfWalletController.preferencesController, 'setAddresses');
      sinon.spy(
        ecfWalletController.preferencesController,
        'setSelectedAddress',
      );
      sinon.spy(ecfWalletController.preferencesController, 'setAccountLabel');
      await ecfWalletController
        .connectHardware('trezor', 0, `m/44/0'/0'`)
        .catch(() => null);
      await ecfWalletController.unlockHardwareWalletAccount(
        accountToUnlock,
        'trezor',
        `m/44/0'/0'`,
      );
    });

    afterEach(function () {
      window.open.restore();
      ecfWalletController.keyringController.addNewAccount.restore();
      ecfWalletController.keyringController.getAccounts.restore();
      ecfWalletController.preferencesController.setAddresses.restore();
      ecfWalletController.preferencesController.setSelectedAddress.restore();
      ecfWalletController.preferencesController.setAccountLabel.restore();
    });

    it('should set unlockedAccount in the keyring', async function () {
      const keyrings =
        await ecfWalletController.keyringController.getKeyringsByType(
          'Trezor Hardware',
        );
      assert.equal(
        (await keyrings[0].serialize()).unlockedAccount,
        accountToUnlock,
      );
    });

    it('should call keyringController.addNewAccount', async function () {
      assert(ecfWalletController.keyringController.addNewAccount.calledOnce);
    });

    it('should call preferencesController.setAddresses', async function () {
      assert(ecfWalletController.preferencesController.setAddresses.calledOnce);
    });

    it('should call preferencesController.setSelectedAddress', async function () {
      assert(
        ecfWalletController.preferencesController.setSelectedAddress.calledOnce,
      );
    });

    it('should call preferencesController.setAccountLabel', async function () {
      assert(
        ecfWalletController.preferencesController.setAccountLabel.calledOnce,
      );
    });
  });

  describe('#setCustomRpc', function () {
    it('changes the network controller rpc', async function () {
      const rpcTarget = ecfWalletController.setCustomRpc(
        CUSTOM_RPC_URL,
        '0x539',
      );
      const networkControllerState =
        ecfWalletController.networkController.store.getState();
      assert.equal(networkControllerState.provider.rpcTarget, CUSTOM_RPC_URL);
      assert.equal(await rpcTarget, CUSTOM_RPC_URL);
    });
  });

  describe('#addNewAccount', function () {
    it('errors when an primary keyring is does not exist', async function () {
      const addNewAccount = ecfWalletController.addNewAccount();

      try {
        await addNewAccount;
        assert.fail('should throw');
      } catch (e) {
        assert.equal(e.message, 'EcfWalletController - No HD Key Tree found');
      }
    });
  });

  describe('#verifySeedPhrase without a vault', function () {
    it('errors when no keyring is provided', async function () {
      await assert.rejects(ecfWalletController.verifySeedPhrase(), {
        message: 'EcfWalletController - No HD Key Tree found',
      });
    });
  });

  describe('#verifyseedPhrase', function () {
    it('#addNewAccount', async function () {
      await ecfWalletController.createNewVaultAndKeychain('password');
      await ecfWalletController.addNewAccount();
      const getAccounts =
        await ecfWalletController.keyringController.getAccounts();
      assert.equal(getAccounts.length, 2);
    });
  });

  describe('#removeAccount', function () {
    const addressToRemove = '0x1';

    beforeEach(async function () {
      sinon.stub(ecfWalletController.preferencesController, 'removeAddress');
      sinon.stub(ecfWalletController.accountTracker, 'removeAccount');
      sinon.stub(ecfWalletController.keyringController, 'removeAccount');
      sinon.stub(
        ecfWalletController.permissionsController,
        'removeAllAccountPermissions',
      );

      await ecfWalletController.removeAccount(addressToRemove);
    });

    afterEach(function () {
      ecfWalletController.keyringController.removeAccount.restore();
      ecfWalletController.accountTracker.removeAccount.restore();
      ecfWalletController.preferencesController.removeAddress.restore();
      ecfWalletController.permissionsController.removeAllAccountPermissions.restore();
    });

    it('should call preferencesController.removeAddress', async function () {
      assert(
        ecfWalletController.preferencesController.removeAddress.calledWith(
          addressToRemove,
        ),
      );
    });

    it('should call accountTracker.removeAccount', async function () {
      assert(
        ecfWalletController.accountTracker.removeAccount.calledWith([
          addressToRemove,
        ]),
      );
    });

    it('should call keyringController.removeAccount', async function () {
      assert(
        ecfWalletController.keyringController.removeAccount.calledWith(
          addressToRemove,
        ),
      );
    });

    it('should call permissionsController.removeAllAccountPermissions', async function () {
      assert(
        ecfWalletController.permissionsController.removeAllAccountPermissions.calledWith(
          addressToRemove,
        ),
      );
    });
  });

  describe('#setCurrentLocale', function () {
    it('sets current locale in preferences controller', async function () {
      await promisify(ecfWalletController.getApi().setCurrentLocale)('ja');
      const preferenceCurrentLocale =
        ecfWalletController.preferencesController.store.getState()
          .currentLocale;
      assert.equal(preferenceCurrentLocale, 'ja');
    });
  });

  describe('#getTypedDataAlerts', function () {
    it('says so when the checks fail, instead of showing no alerts', async function () {
      sandbox.stub(ecfWalletController, 'getSecurityContext').throws();
      assert.deepEqual(
        await ecfWalletController.getTypedDataAlerts({ data: '{}' }),
        [{ id: 'alertSecurityChecksFailed', severity: 'warning', args: [] }],
      );
    });
  });

  describe('eth_sign', function () {
    it('is refused before any approval is created, for sites and internal callers alike', async function () {
      for (const isInternal of [false, true]) {
        const engine = ecfWalletController.setupProviderEngine({
          origin: 'https://dapp.test',
          location: 'https://dapp.test/',
          isInternal,
        });
        const response = await new Promise((resolve) => {
          engine.handle(
            {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_sign',
              params: [
                '0xc42edfcc21ed14dda456aa0756c153f7985d8813',
                `0x${'11'.repeat(32)}`,
              ],
            },
            (_, res) => resolve(res),
          );
        });
        assert.equal(response.error.code, -32601);
        assert.match(response.error.message, /eth_sign is disabled/u);
      }
      assert.equal(ecfWalletController.signMessage, undefined);
      assert.equal(ecfWalletController.getApi().signMessage, undefined);
    });
  });

  describe('eth_signTypedData_v1', function () {
    it('is refused, not forwarded to the RPC node, for sites and internal callers alike', async function () {
      const request = sinon.spy(async () => null);
      sandbox.stub(ecfWalletController, 'provider').value({ request });
      for (const isInternal of [false, true]) {
        const engine = ecfWalletController.setupProviderEngine({
          origin: 'https://dapp.test',
          location: 'https://dapp.test/',
          isInternal,
        });
        const response = await engine.handle({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_signTypedData_v1',
          params: [
            [{ type: 'string', name: 'message', value: 'hi' }],
            '0xc42edfcc21ed14dda456aa0756c153f7985d8813',
          ],
        });
        assert.equal(response.error.code, -32601);
        assert.match(response.error.message, /eth_signTypedData_v4/u);
      }
      assert.ok(request.notCalled, 'nothing should reach the RPC node');
    });
  });

  describe('wallet_registerOnboarding', function () {
    it('ignores a tab ID supplied by a sender without a tab', async function () {
      const registerOnboarding = sandbox
        .stub(ecfWalletController.onboardingController, 'registerOnboarding')
        .resolves();
      const engine = ecfWalletController.setupProviderEngine({
        origin: 'chrome-extension://other-extension-id',
        location: 'chrome-extension://other-extension-id/page.html',
        extensionId: 'other-extension-id',
      });
      const response = await engine.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'wallet_registerOnboarding',
        tabId: 5,
      });
      assert.equal(response.result, true);
      assert.equal(registerOnboarding.called, false);
    });
  });

  describe('#newUnsignedPersonalMessage', function () {
    let msgParams, ecfWalletPersonalMsgs, personalMessages, msgId;

    const address = '0xc42edfcc21ed14dda456aa0756c153f7985d8813';
    const data = '0x43727970746f6b697474696573';

    beforeEach(async function () {
      sandbox.stub(ecfWalletController, 'getBalance');
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0');
      });

      await ecfWalletController.createNewVaultAndRestore(
        'foobar1337',
        TEST_SEED_ALT,
      );

      msgParams = {
        from: address,
        data,
      };

      const promise = ecfWalletController.newUnsignedPersonalMessage(msgParams);
      // handle the promise so it doesn't throw an unhandledRejection
      promise.then(noop).catch(noop);

      ecfWalletPersonalMsgs =
        ecfWalletController.personalMessageManager.getUnapprovedMsgs();
      personalMessages = ecfWalletController.personalMessageManager.messages;
      msgId = Object.keys(ecfWalletPersonalMsgs)[0];
      personalMessages[0].msgParams.ecfWalletId = parseInt(msgId, 10);
    });

    it('errors with no from in msgParams', async function () {
      try {
        await ecfWalletController.newUnsignedPersonalMessage({
          data,
        });
        assert.fail('should have thrown');
      } catch (error) {
        assert.equal(
          error.message,
          'ecf-wallet Message Signature: from field is required.',
        );
      }
    });

    it('sets the status to unapproved', function () {
      assert.equal(ecfWalletPersonalMsgs[msgId].msgParams.from, address);
      assert.equal(ecfWalletPersonalMsgs[msgId].msgParams.data, data);
      assert.equal(ecfWalletPersonalMsgs[msgId].status, 'unapproved');
    });

    it('sets the type to personal_sign', function () {
      assert.equal(ecfWalletPersonalMsgs[msgId].type, 'personal_sign');
    });

    it('rejects the message', function () {
      const msgIdInt = parseInt(msgId, 10);
      ecfWalletController.getApi().cancelPersonalMessage(msgIdInt, noop);
      assert.equal(personalMessages[0].status, 'rejected');
    });

    it('errors when signing a message', async function () {
      await ecfWalletController.signPersonalMessage(
        personalMessages[0].msgParams,
      );
      assert.equal(ecfWalletPersonalMsgs[msgId].status, 'signed');
      assert.equal(
        ecfWalletPersonalMsgs[msgId].rawSig,
        '0x6a1b65e2b8ed53cf398a769fad24738f9fbe29841fe6854e226953542c4b6a173473cb152b6b1ae5f06d601d45dd699a129b0a8ca84e78b423031db5baa734741b',
      );
    });
  });

  describe('#rejectPendingApprovals', function () {
    it('refuses every kind of pending request, even if one refusal fails', async function () {
      const { txController, permissionsController, networkRequestController } =
        ecfWalletController;
      sandbox
        .stub(txController.txStateManager, 'getUnapprovedTxList')
        .returns({ 1: { id: 1 } });
      sandbox
        .stub(txController, 'cancelTransaction')
        .rejects(new Error('tx failure'));
      sandbox
        .stub(permissionsController.approvals.store, 'getState')
        .returns({ permissionsRequests: [{ metadata: { id: 'p1' } }] });
      sandbox.stub(permissionsController, 'rejectPermissionsRequest');
      sandbox.stub(
        ecfWalletController.preferencesController,
        'rejectPendingWatchAssets',
      );
      ecfWalletController.personalMessageManager.addMsg({
        id: 5,
        status: 'unapproved',
        msgParams: {},
      });
      networkRequestController.showApprovalRequest = noop;
      const networkRequest = networkRequestController.addRequest(
        'https://site.test',
        { type: 'switch', network: {}, warnings: [], perform: noop },
      );

      await ecfWalletController.rejectPendingApprovals();

      assert.deepEqual(txController.cancelTransaction.firstCall.args, [1]);
      assert.equal(
        ecfWalletController.personalMessageManager.getMsg(5).status,
        'rejected',
      );
      assert.deepEqual(
        permissionsController.rejectPermissionsRequest.firstCall.args,
        ['p1'],
      );
      await assert.rejects(networkRequest, { code: 4001 });
      assert.equal(
        ecfWalletController.preferencesController.rejectPendingWatchAssets
          .calledOnce,
        true,
      );
    });
  });

  describe('#setupUntrustedCommunication', function () {
    const mockTxParams = { from: TEST_ADDRESS };

    beforeEach(function () {
      initializeMockMiddlewareLog();
    });

    after(function () {
      tearDownMockMiddlewareLog();
    });

    describe('phishing warning', function () {
      const warningUrl = 'chrome-extension://fake-extension-id/phishing.html';
      let tabsUpdate;

      beforeEach(function () {
        sessionStorageMock.items = {};
        tabsUpdate = sandbox.stub(ExtensionApiMock.tabs, 'update').resolves();
      });

      async function connect(sender) {
        const stream = createThoughStream((_chunk, _, cb) => cb());
        ecfWalletController.setupUntrustedCommunication(stream, sender);
        // Let the warning be recorded and the tab navigated.
        await new Promise((resolve) => setTimeout(resolve, 0));
        stream.end();
      }

      it('sends a flagged tab to the warning, and continues to that site only', async function () {
        await connect({
          url: 'https://myethereumwalletntw.com/login?next=1',
          tab: { id: 7 },
          frameId: 0,
        });
        assert.deepStrictEqual(tabsUpdate.lastCall.args, [
          7,
          { url: warningUrl },
        ]);
        assert.equal(
          ecfWalletController.phishingController.test(
            'myethereumwalletntw.com',
          ),
          true,
        );

        await ecfWalletController.continueFromPhishingWarning(7);
        assert.deepStrictEqual(tabsUpdate.lastCall.args, [
          7,
          { url: 'https://myethereumwalletntw.com/login?next=1' },
        ]);
        assert.equal(
          ecfWalletController.phishingController.test(
            'myethereumwalletntw.com',
          ),
          false,
        );

        // Nothing is left for a second request, or for another tab.
        tabsUpdate.resetHistory();
        await ecfWalletController.continueFromPhishingWarning(7);
        await ecfWalletController.continueFromPhishingWarning(8);
        assert.equal(tabsUpdate.callCount, 0);
      });

      it('replaces the whole tab when a frame is flagged', async function () {
        await connect({
          url: 'https://myethereumwalletntw.com/embed',
          tab: { id: 9, url: 'https://news.example/article' },
          frameId: 3,
        });
        assert.deepStrictEqual(tabsUpdate.lastCall.args, [
          9,
          { url: warningUrl },
        ]);
        await ecfWalletController.continueFromPhishingWarning(9);
        assert.deepStrictEqual(tabsUpdate.lastCall.args, [
          9,
          { url: 'https://news.example/article' },
        ]);
      });

      it('checks a page that did not get the provider', async function () {
        // A content script sends this when its page skipped the provider,
        // here through a fragment naming a domain the provider avoids.
        const flagged = ecfWalletController.checkForPhishing({
          url: 'https://myethereumwalletntw.com/#dropbox.com',
          tab: { id: 11 },
          frameId: 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(flagged, true);
        assert.deepStrictEqual(tabsUpdate.lastCall.args, [
          11,
          { url: warningUrl },
        ]);

        tabsUpdate.resetHistory();
        assert.equal(
          ecfWalletController.checkForPhishing({
            url: 'https://ethcf.org/#dropbox.com',
            tab: { id: 12 },
          }),
          false,
        );
        ecfWalletController.preferencesController.setUsePhishDetect(false);
        assert.equal(
          ecfWalletController.checkForPhishing({
            url: 'https://myethereumwalletntw.com/',
            tab: { id: 13 },
          }),
          false,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(tabsUpdate.callCount, 0);
      });

      it('only refuses a flagged connection from outside a tab', async function () {
        await connect({ url: 'https://myethereumwalletntw.com' });
        assert.equal(tabsUpdate.callCount, 0);
      });
    });

    it('gives another extension its own origin, not the page it runs on', function () {
      const setupProviderEngine = sandbox
        .stub(ecfWalletController, 'setupProviderEngine')
        .returns({
          handle: () => undefined,
          on: () => undefined,
          destroy: () => undefined,
        });
      const originFor = (sender) => {
        const stream = createThoughStream((_chunk, _, cb) => cb());
        ecfWalletController.setupProviderConnection(stream, sender);
        stream.end();
        return setupProviderEngine.lastCall.args[0].origin;
      };

      assert.equal(
        originFor({
          id: 'otherextension',
          url: 'https://connected-site.test/page',
          tab: { id: 3 },
        }),
        'chrome-extension://otherextension',
      );
      // Firefox reports the extension's own origin.
      assert.equal(
        originFor({
          id: 'other@example',
          origin: 'moz-extension://5b0c9a1e',
          url: 'https://connected-site.test/page',
        }),
        'moz-extension://5b0c9a1e',
      );
      // A page keeps its origin.
      assert.equal(
        originFor({ url: 'https://ethcf.org/donate', tab: { id: 4 } }),
        'https://ethcf.org',
      );
    });

    it("uses a page's security origin and refuses an opaque one", function () {
      const setupProviderEngine = sandbox
        .stub(ecfWalletController, 'setupProviderEngine')
        .returns({
          handle: () => undefined,
          on: () => undefined,
          destroy: () => undefined,
        });
      const connect = (sender) => {
        const stream = createThoughStream((_chunk, _, cb) => cb());
        ecfWalletController.setupUntrustedCommunication(stream, sender);
        stream.end();
      };

      connect({
        url: 'https://site.test/page',
        origin: 'https://site.test',
        tab: { id: 1 },
      });
      assert.equal(
        setupProviderEngine.lastCall.args[0].origin,
        'https://site.test',
      );

      // A sandboxed frame, or a page with a sandbox CSP, keeps the site's URL
      // but must not act for the site.
      setupProviderEngine.resetHistory();
      connect({
        url: 'https://site.test/upload',
        origin: 'null',
        tab: { id: 1 },
      });
      assert.equal(setupProviderEngine.callCount, 0);
      assert.throws(
        () =>
          ecfWalletController.setupProviderConnection(
            createThoughStream((_chunk, _, cb) => cb()),
            { url: 'https://site.test/upload', origin: 'null' },
          ),
        /no origin/u,
      );
    });

    it('adds a tabId and origin to requests', function (done) {
      const messageSender = {
        url: 'http://mycrypto.com',
        tab: { id: 456 },
      };
      const streamTest = createThoughStream((chunk, _, cb) => {
        if (chunk.data && chunk.data.method) {
          cb(null, chunk);
          return;
        }
        cb();
      });

      ecfWalletController.setupUntrustedCommunication(
        streamTest,
        messageSender,
      );

      const message = {
        id: 1999133338649204,
        jsonrpc: '2.0',
        params: [{ ...mockTxParams }],
        method: 'eth_sendTransaction',
      };
      streamTest.write(
        {
          name: 'provider',
          data: message,
        },
        null,
        () => {
          setTimeout(() => {
            assert.deepStrictEqual(loggerMiddlewareMock.requests[0], {
              ...message,
              origin: 'http://mycrypto.com',
              tabId: 456,
            });
            done();
          });
        },
      );
    });

    it('should add origin and no tabId to request if tabId not provided', function (done) {
      const messageSender = {
        url: 'http://mycrypto.com',
      };
      const streamTest = createThoughStream((chunk, _, cb) => {
        if (chunk.data && chunk.data.method) {
          cb(null, chunk);
          return;
        }
        cb();
      });

      ecfWalletController.setupUntrustedCommunication(
        streamTest,
        messageSender,
      );

      const message = {
        id: 1999133338649204,
        jsonrpc: '2.0',
        params: [{ ...mockTxParams }],
        method: 'eth_sendTransaction',
      };
      streamTest.write(
        {
          name: 'provider',
          data: message,
        },
        null,
        () => {
          setTimeout(() => {
            assert.deepStrictEqual(loggerMiddlewareMock.requests[0], {
              ...message,
              origin: 'http://mycrypto.com',
              tabId: undefined,
            });
            done();
          });
        },
      );
    });
  });

  describe('#setupTrustedCommunication', function () {
    it('answers API requests on the controller stream', async function () {
      const messageSender = {
        url: 'http://mycrypto.com',
        tab: {},
      };
      const { promise, resolve } = deferredPromise();
      const streamTest = createThoughStream((chunk, _, cb) => {
        if (chunk.name === 'controller' && chunk.data.id === 1) {
          resolve(chunk.data);
        }
        cb();
      });

      ecfWalletController.setupTrustedCommunication(streamTest, messageSender);
      streamTest.push({
        name: 'controller',
        data: { jsonrpc: '2.0', id: 1, method: 'getState', params: [] },
      });
      const response = await promise;
      assert.equal(response.error, undefined);
      assert.equal(typeof response.result, 'object');
      streamTest.end();
    });
  });

  describe('#setupControllerConnection', function () {
    // A UI connected to the controller through a pair of object streams.
    const connect = () => {
      const toBackground = new PassThrough({ objectMode: true });
      const toUi = new PassThrough({ objectMode: true });
      const backgroundStream = Duplex.from({
        readable: toBackground,
        writable: toUi,
      });
      const uiStream = Duplex.from({ readable: toUi, writable: toBackground });
      ecfWalletController.setupControllerConnection(backgroundStream);
      return {
        background: metaRPCClientFactory(uiStream),
        backgroundStream,
        toBackground,
      };
    };

    it('calls API methods and returns their results', async function () {
      sandbox.stub(ecfWalletController, 'getApi').returns({
        add: (a, b, cb) => cb(null, a + b),
      });
      const { background } = connect();
      assert.equal(await promisify(background.add)(2, 3), 5);
    });

    it('passes API errors on with their message and code', async function () {
      sandbox.stub(ecfWalletController, 'getApi').returns({
        fail: (cb) => cb(Object.assign(new Error('Nope'), { code: 4001 })),
        failPlain: (cb) => cb(new Error('Plain failure')),
      });
      const { background } = connect();
      await assert.rejects(promisify(background.fail)(), {
        message: 'Nope',
        code: 4001,
      });
      await assert.rejects(promisify(background.failPlain)(), {
        message: 'Plain failure',
      });
    });

    it('refuses methods that are not part of the API', async function () {
      sandbox.stub(ecfWalletController, 'getApi').returns({});
      const { background } = connect();
      for (const method of ['missing', 'constructor', 'toString']) {
        await assert.rejects(
          new Promise((resolve, reject) =>
            background.request(method, [
              (error, result) => (error ? reject(error) : resolve(result)),
            ]),
          ),
          { code: -32601 },
        );
      }
    });

    it('pushes state updates until the connection ends', async function () {
      sandbox.stub(ecfWalletController, 'getApi').returns({});
      const before = ecfWalletController.listenerCount('update');
      const { background, backgroundStream, toBackground } = connect();
      const { promise, resolve } = deferredPromise();
      background.on('update', resolve);
      ecfWalletController.privateSendUpdate();
      const state = await promise;
      assert.equal(typeof state.isUnlocked, 'boolean');

      // The UI closes: both directions of the stream finish.
      toBackground.end();
      backgroundStream.end();
      await new Promise((resolveTick) => setImmediate(resolveTick));
      assert.equal(ecfWalletController.listenerCount('update'), before);
    });
  });

  describe('controllerConnectionChanged', function () {
    it('runs token detection only while a UI connection is open', function () {
      ecfWalletController.emit('controllerConnectionChanged', 1);
      assert.equal(ecfWalletController.detectTokensController.isOpen, true);

      ecfWalletController.emit('controllerConnectionChanged', 0);
      assert.equal(ecfWalletController.detectTokensController.isOpen, false);
    });
  });

  describe('#_onKeyringControllerUpdate', function () {
    it('should do nothing if there are no keyrings in state', async function () {
      const syncAddresses = sinon.fake();
      const syncWithAddresses = sinon.fake();
      sandbox.replace(ecfWalletController, 'preferencesController', {
        syncAddresses,
      });
      sandbox.replace(ecfWalletController, 'accountTracker', {
        syncWithAddresses,
      });

      const oldState = ecfWalletController.getState();
      await ecfWalletController._onKeyringControllerUpdate({ keyrings: [] });

      assert.ok(syncAddresses.notCalled);
      assert.ok(syncWithAddresses.notCalled);
      assert.deepEqual(ecfWalletController.getState(), oldState);
    });

    it('should sync addresses if there are keyrings in state', async function () {
      const syncAddresses = sinon.fake();
      const syncWithAddresses = sinon.fake();
      sandbox.replace(ecfWalletController, 'preferencesController', {
        syncAddresses,
      });
      sandbox.replace(ecfWalletController, 'accountTracker', {
        syncWithAddresses,
      });

      const oldState = ecfWalletController.getState();
      await ecfWalletController._onKeyringControllerUpdate({
        keyrings: [
          {
            accounts: ['0x1', '0x2'],
          },
        ],
      });

      assert.deepEqual(syncAddresses.args, [[['0x1', '0x2']]]);
      assert.deepEqual(syncWithAddresses.args, [[['0x1', '0x2']]]);
      assert.deepEqual(ecfWalletController.getState(), oldState);
    });

    it('should NOT update selected address if already unlocked', async function () {
      const syncAddresses = sinon.fake();
      const syncWithAddresses = sinon.fake();
      sandbox.replace(ecfWalletController, 'preferencesController', {
        syncAddresses,
      });
      sandbox.replace(ecfWalletController, 'accountTracker', {
        syncWithAddresses,
      });

      const oldState = ecfWalletController.getState();
      await ecfWalletController._onKeyringControllerUpdate({
        isUnlocked: true,
        keyrings: [
          {
            accounts: ['0x1', '0x2'],
          },
        ],
      });

      assert.deepEqual(syncAddresses.args, [[['0x1', '0x2']]]);
      assert.deepEqual(syncWithAddresses.args, [[['0x1', '0x2']]]);
      assert.deepEqual(ecfWalletController.getState(), oldState);
    });
  });
});

function deferredPromise() {
  let resolve;
  const promise = new Promise((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
}
