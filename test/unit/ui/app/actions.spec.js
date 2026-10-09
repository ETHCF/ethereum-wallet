import EthQuery from '@metamask/eth-query';
import assert from 'assert';
import { cloneDeep } from 'lodash';
import createMockStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';
import sinon from 'sinon';

import enLocale from '../../../../app/_locales/en/messages.json';
import EcfWalletController from '../../../../app/scripts/ecf-wallet-controller';
import { INCORRECT_PASSWORD_MESSAGE } from '../../../../app/scripts/lib/enums';
import KeyringController from '../../../../app/scripts/lib/modern-keyring-controller';
import sendReducer from '../../../../ui/app/ducks/send/send.duck';
import {
  getGasLoadingError,
  isSendFormInError,
} from '../../../../ui/app/selectors/send';
import * as actions from '../../../../ui/app/store/actions';
import { createTestProviderTools } from '../../../stub/provider';
import firstTimeState from '../../localhostState';

const { provider } = createTestProviderTools({ scaffold: {} });
const middleware = [thunk];
const defaultState = { ecfWallet: {} };
const mockStore = (state = defaultState) => createMockStore(middleware)(state);

describe('Actions', function () {
  const noop = () => undefined;

  const currentNetworkId = '42';

  let background, ecfWalletController;

  const TEST_SEED =
    'debris dizzy just program just float decrease vacant alarm reduce speak stadium';
  const password = 'a-fake-password';
  const importPrivkey =
    '4cfd3e90fc78b0f86bf7524722150bb8da9c60cd532564d7ff43f5716514f553';

  beforeEach(async function () {
    ecfWalletController = new EcfWalletController({
      platform: { getVersion: () => 'foo' },
      provider,
      keyringController: new KeyringController({}),
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
    });

    await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED);

    await ecfWalletController.importAccountWithStrategy('Private Key', [
      importPrivkey,
    ]);

    background = ecfWalletController.getApi();

    actions._setBackgroundConnection(background);

    global.ethQuery = new EthQuery(provider);
  });

  describe('#tryUnlockEcfWallet', function () {
    let submitPasswordSpy, verifySeedPhraseSpy;

    afterEach(function () {
      submitPasswordSpy.restore();
      verifySeedPhraseSpy.restore();
    });

    it('calls submitPassword and verifySeedPhrase', async function () {
      const store = mockStore();

      submitPasswordSpy = sinon.spy(background, 'submitPassword');
      verifySeedPhraseSpy = sinon.spy(background, 'verifySeedPhrase');

      await store.dispatch(actions.tryUnlockEcfWallet());
      assert(submitPasswordSpy.calledOnce);
      assert(verifySeedPhraseSpy.calledOnce);
    });

    it('errors on submitPassword will fail', async function () {
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'UNLOCK_FAILED', value: 'error in submitPassword' },
        { type: 'HIDE_LOADING_INDICATION' },
      ];

      submitPasswordSpy = sinon.stub(background, 'submitPassword');

      submitPasswordSpy.callsFake((_, callback) => {
        callback(new Error('error in submitPassword'));
      });

      await assert.rejects(async () => {
        await store.dispatch(actions.tryUnlockEcfWallet('test'));
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });

    it('stays unlocked when verifySeedPhrase fails, since the vault is already open', async function () {
      const store = mockStore();

      verifySeedPhraseSpy = sinon.stub(background, 'verifySeedPhrase');
      verifySeedPhraseSpy.callsFake((callback) => {
        callback(new Error('error'));
      });

      await store.dispatch(actions.tryUnlockEcfWallet('test'));

      const dispatched = store.getActions();
      assert.equal(
        dispatched.filter((action) => action.type === 'UNLOCK_FAILED').length,
        0,
      );
      assert.equal(
        dispatched.filter((action) => action.type === 'UNLOCK_SUCCEEDED')
          .length,
        1,
      );
    });
  });

  describe('#createNewVaultAndRestore', function () {
    it('errors when callback in createNewVaultAndRestore throws', async function () {
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'DISPLAY_WARNING', value: 'error' },
        { type: 'HIDE_LOADING_INDICATION' },
      ];

      const createNewVaultAndRestoreSpy = sinon.stub(
        background,
        'createNewVaultAndRestore',
      );

      createNewVaultAndRestoreSpy.callsFake((_, __, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(async () => {
        await store.dispatch(actions.createNewVaultAndRestore());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#requestRevealSeedWords', function () {
    let submitPasswordSpy;

    afterEach(function () {
      submitPasswordSpy.restore();
    });

    it('gets the seed phrase from the background with the password', async function () {
      const store = mockStore();

      submitPasswordSpy = sinon.spy(background, 'getSeedPhrase');

      const seedWords = await store.dispatch(
        actions.requestRevealSeedWords(password),
      );
      assert(submitPasswordSpy.calledOnceWith(password));
      assert.equal(seedWords, TEST_SEED);
    });

    it('displays warning error message then callback in background errors', async function () {
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      submitPasswordSpy = sinon.stub(background, 'getSeedPhrase');
      submitPasswordSpy.callsFake((_, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(async () => {
        await store.dispatch(actions.requestRevealSeedWords(password));
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#removeAccount', function () {
    let removeAccountStub;

    afterEach(function () {
      removeAccountStub.restore();
    });

    it('calls removeAccount in background and expect actions to show account', async function () {
      const store = mockStore();

      const expectedActions = [
        'SHOW_LOADING_INDICATION',
        'SELECTED_ADDRESS_CHANGED',
        'UPDATE_ECF_WALLET_STATE',
        'HIDE_LOADING_INDICATION',
        'SHOW_ACCOUNTS_PAGE',
      ];

      removeAccountStub = sinon.stub(background, 'removeAccount');
      removeAccountStub.callsFake((_, callback) => callback());

      await store.dispatch(
        actions.removeAccount('0xe18035bf8712672935fdb4e5e431b1a0183d2dfc'),
      );
      assert(removeAccountStub.calledOnce);
      const actionTypes = store.getActions().map((action) => action.type);
      assert.deepEqual(actionTypes, expectedActions);
    });

    it('displays warning error message when removeAccount callback errors', async function () {
      const store = mockStore();

      const expectedActions = [
        'SHOW_LOADING_INDICATION',
        'DISPLAY_WARNING',
        'HIDE_LOADING_INDICATION',
      ];

      removeAccountStub = sinon.stub(background, 'removeAccount');
      removeAccountStub.callsFake((_, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(async () => {
        await store.dispatch(
          actions.removeAccount('0xe18035bf8712672935fdb4e5e431b1a0183d2dfc'),
        );
      });
      const actionTypes = store.getActions().map((action) => action.type);
      assert.deepEqual(actionTypes, expectedActions);
    });
  });

  describe('#importNewAccount', function () {
    let importAccountWithStrategySpy;

    afterEach(function () {
      importAccountWithStrategySpy.restore();
    });

    it('calls importAccountWithStrategies in background', async function () {
      const store = mockStore();

      importAccountWithStrategySpy = sinon.spy(
        background,
        'importAccountWithStrategy',
      );

      await store.dispatch(
        actions.importNewAccount('Private Key', [
          'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
        ]),
      );
      assert(importAccountWithStrategySpy.calledOnce);
    });

    it('displays warning error message when importAccount in background callback errors', async function () {
      const store = mockStore();

      const expectedActions = [
        {
          type: 'SHOW_LOADING_INDICATION',
          value: 'This may take a while, please be patient.',
        },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      importAccountWithStrategySpy = sinon.stub(
        background,
        'importAccountWithStrategy',
      );
      importAccountWithStrategySpy.callsFake((_, __, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(async () => {
        await store.dispatch(actions.importNewAccount());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#addNewAccount', function () {
    it('Adds a new account', async function () {
      const store = mockStore({ ecfWallet: { identities: {} } });

      const addNewAccountSpy = sinon.spy(background, 'addNewAccount');

      await store.dispatch(actions.addNewAccount());
      assert(addNewAccountSpy.calledOnce);
      addNewAccountSpy.restore();
    });

    it('clears the loading indicator and displays the error when it fails', async function () {
      const store = mockStore({ ecfWallet: { identities: {} } });
      const addNewAccountStub = sinon
        .stub(background, 'addNewAccount')
        .callsArgWith(0, new Error('error'));

      await assert.rejects(store.dispatch(actions.addNewAccount()), {
        message: 'error',
      });
      assert.deepEqual(store.getActions(), [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ]);
      addNewAccountStub.restore();
    });
  });

  describe('#checkHardwareStatus', function () {
    it('shows loading indicator and displays error', async function () {
      sinon
        .stub(background, 'checkHardwareStatus')
        .callsArgWith(2, new Error('error'));
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.checkHardwareStatus());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#forgetDevice', function () {
    it('shows loading indicator and displays error', async function () {
      sinon
        .stub(background, 'forgetDevice')
        .callsArgWith(1, new Error('error'));
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.forgetDevice());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#connectHardware', function () {
    it('clears loading indicator and displays connection errors', async function () {
      sinon
        .stub(background, 'connectHardware')
        .callsArgWith(3, new Error('error'));
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.connectHardware());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#unlockHardwareWalletAccount', function () {
    it('clears loading indicator and displays connection errors', async function () {
      sinon
        .stub(background, 'unlockHardwareWalletAccount')
        .callsArgWith(3, new Error('error'));
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.unlockHardwareWalletAccount());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#signPersonalMsg', function () {
    let signPersonalMessageSpy, ecfWalletMsgs, msgId, personalMessages;

    const msgParams = {
      from: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
      data: '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
    };

    beforeEach(function () {
      ecfWalletController.newUnsignedPersonalMessage(msgParams, noop);
      ecfWalletMsgs =
        ecfWalletController.personalMessageManager.getUnapprovedMsgs();
      personalMessages = ecfWalletController.personalMessageManager.messages;
      msgId = Object.keys(ecfWalletMsgs)[0];
      personalMessages[0].msgParams.ecfWalletId = parseInt(msgId, 10);
    });

    afterEach(function () {
      signPersonalMessageSpy.restore();
    });

    it('calls signPersonalMessage', async function () {
      const store = mockStore();

      signPersonalMessageSpy = sinon.spy(background, 'signPersonalMessage');

      await store.dispatch(
        actions.signPersonalMsg({
          ...msgParams,
          ecfWalletId: parseInt(msgId, 10),
        }),
      );
      assert(signPersonalMessageSpy.calledOnce);
    });

    it('throws if signPersonalMessage throws', async function () {
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      signPersonalMessageSpy = sinon.stub(background, 'signPersonalMessage');
      signPersonalMessageSpy.callsFake((_, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(async () => {
        await store.dispatch(
          actions.signPersonalMsg({
            ...msgParams,
            ecfWalletId: parseInt(msgId, 10),
          }),
        );
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#signTypedMsg', function () {
    it('returns expected actions with error', async function () {
      sinon
        .stub(background, 'signTypedMessage')
        .callsArgWith(1, new Error('error'));
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.signTypedMsg());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#signTx', function () {
    let sendTransactionSpy;

    beforeEach(function () {
      sendTransactionSpy = sinon.stub(global.ethQuery, 'sendTransaction');
    });

    afterEach(function () {
      sendTransactionSpy.restore();
    });

    it('calls sendTransaction in global ethQuery', function () {
      const store = mockStore();

      store.dispatch(actions.signTx());
      assert(sendTransactionSpy.calledOnce);
    });

    it('errors in when sendTransaction throws', function () {
      const store = mockStore();
      const expectedActions = [
        { type: 'DISPLAY_WARNING', value: 'error' },
        { type: 'SHOW_CONF_TX_PAGE', id: undefined },
      ];
      sendTransactionSpy.callsFake((_, callback) => {
        callback(new Error('error'));
      });

      store.dispatch(actions.signTx());
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#updatedGasData', function () {
    it('holds the send form when the gas limit cannot be estimated', async function () {
      const getCode = sinon
        .stub(global.ethQuery, 'getCode')
        .callsArgWith(1, new Error('getCode failed'));
      const store = mockStore();

      const mockData = {
        gasPrice: '0x3b9aca00', //
        blockGasLimit: '0x6ad79a', // 7002010
        selectedAddress: '0x0DCD5D886577d5081B0c52e242Ef29E70Be3E7bc',
        to: '0xEC1Adf982415D2Ef5ec55899b9Bfb8BC0f29251B',
        value: '0xde0b6b3a7640000', // 1000000000000000000
      };

      try {
        await store.dispatch(actions.updateGasData(mockData));
      } finally {
        getCode.restore();
      }
      const actionsDispatched = store.getActions();
      assert.deepEqual(actionsDispatched, [
        { type: 'GAS_LOADING_STARTED' },
        {
          type: 'ecf-wallet/send/UPDATE_SEND_ERRORS',
          value: { gasLoading: 'gasEstimateFailed' },
        },
        { type: 'GAS_LOADING_FINISHED' },
      ]);
      // The send reducer handles it, so the form shows the error and is held.
      const sendState = actionsDispatched.reduce(sendReducer, undefined);
      assert.equal(isSendFormInError({ send: sendState }), true);
      assert.equal(getGasLoadingError({ send: sendState }), true);
    });

    it('returns default gas limit for basic eth transaction', async function () {
      const mockData = {
        gasPrice: '0x3b9aca00',
        blockGasLimit: '0x6ad79a', // 7002010
        selectedAddress: '0x0DCD5D886577d5081B0c52e242Ef29E70Be3E7bc',
        to: '0xEC1Adf982415D2Ef5ec55899b9Bfb8BC0f29251B',
        value: '0xde0b6b3a7640000', // 1000000000000000000
      };

      const getCode = sinon
        .stub(global.ethQuery, 'getCode')
        .callsArgWith(1, null, '0x');
      const store = mockStore();

      const expectedActions = [
        { type: 'GAS_LOADING_STARTED' },
        { type: 'UPDATE_GAS_LIMIT', value: '0x5208' },
        { type: 'ecf-wallet/gas/SET_CUSTOM_GAS_LIMIT', value: '0x5208' },
        {
          type: 'ecf-wallet/send/UPDATE_SEND_ERRORS',
          value: { gasLoading: null },
        },
        { type: 'GAS_LOADING_FINISHED' },
      ];

      await store.dispatch(actions.updateGasData(mockData));
      assert.deepEqual(store.getActions(), expectedActions);
      getCode.restore();
    });
  });

  describe('#signTokenTx', function () {
    it('sends a transfer call to the token contract', function () {
      const sendTransaction = sinon
        .stub(global.ethQuery, 'sendTransaction')
        .callsArgWith(1, null, '0x');
      const store = mockStore();
      const token = '0x8d6b81208414189a58339873ab429b6c47ab92d3';
      const recipient = '0xec1adf982415d2ef5ec55899b9bfb8bc0f29251b';
      store.dispatch(
        actions.signTokenTx(token, recipient, 'a', {
          from: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
          value: '0x0',
        }),
      );
      assert(sendTransaction.calledOnce);
      const [txParams] = sendTransaction.firstCall.args;
      assert.equal(txParams.to, token);
      assert.equal(txParams.from, '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc');
      // transfer(address,uint256) with the recipient and an amount of 10
      assert.equal(
        txParams.data,
        `0xa9059cbb000000000000000000000000${recipient.slice(2)}${'a'.padStart(64, '0')}`,
      );
      sendTransaction.restore();
    });
  });

  describe('#updateTransaction', function () {
    let updateTransactionSpy;

    const txParams = {
      from: '0x0000000000000000000000000000000000000001',
      gas: '0x5208',
      gasPrice: '0x3b9aca00',
      to: '0x0000000000000000000000000000000000000002',
      value: '0x0',
    };

    const txData = {
      id: '1',
      status: 'unapproved',
      ecfWalletNetworkId: currentNetworkId,
      txParams,
    };

    beforeEach(async function () {
      const { txStateManager } = ecfWalletController.txController;
      // The background edits only transactions on the selected network.
      await txStateManager.addTx({
        ...txData,
        ecfWalletNetworkId: txStateManager.getNetwork(),
      });
    });

    afterEach(function () {
      updateTransactionSpy.restore();
    });

    it('updates transaction', async function () {
      const store = mockStore();

      updateTransactionSpy = sinon.spy(background, 'updateTransaction');

      await store.dispatch(actions.updateTransaction(txData));

      const resultantActions = store.getActions();
      assert.ok(updateTransactionSpy.calledOnce);
      assert.deepEqual(resultantActions[1], {
        type: 'UPDATE_TRANSACTION_PARAMS',
        id: txData.id,
        value: txParams,
      });
    });

    it('rejects with error message', async function () {
      const store = mockStore();

      updateTransactionSpy = sinon.stub(background, 'updateTransaction');
      updateTransactionSpy.callsFake((_, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(store.dispatch(actions.updateTransaction(txData)), {
        message: 'error',
      });
    });
  });

  describe('#lockEcfWallet', function () {
    let backgroundSetLockedSpy;

    afterEach(function () {
      backgroundSetLockedSpy.restore();
    });

    it('calls setLocked', async function () {
      const store = mockStore();

      backgroundSetLockedSpy = sinon.spy(background, 'setLocked');

      await store.dispatch(actions.lockEcfWallet());
      assert(backgroundSetLockedSpy.calledOnce);
    });

    it('shows a warning but still locks the UI when the background cannot lock', async function () {
      const store = mockStore();

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'DISPLAY_WARNING', value: 'error' },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'LOCK_ECF_WALLET' },
      ];
      backgroundSetLockedSpy = sinon.stub(background, 'setLocked');
      backgroundSetLockedSpy.callsFake((callback) => {
        callback(new Error('error'));
      });

      // It resolves: the UI locks either way.
      await store.dispatch(actions.lockEcfWallet());
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#setSelectedAddress', function () {
    it('errors when setSelectedAddress throws', async function () {
      sinon
        .stub(background, 'setSelectedAddress')
        .callsArgWith(1, new Error('error'));
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await store.dispatch(actions.setSelectedAddress());
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#showAccountDetail', function () {
    it('displays warning if setSelectedAddress throws', async function () {
      sinon
        .stub(background, 'setSelectedAddress')
        .callsArgWith(1, new Error('error'));
      const store = mockStore({
        activeTab: {},
        ecfWallet: { alertEnabledness: {}, selectedAddress: '0x123' },
      });
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await store.dispatch(actions.showAccountDetail());
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#addToken', function () {
    it('errors when addToken in background throws', async function () {
      sinon.stub(background, 'addToken').callsArgWith(4, new Error('error'));
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.addToken());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#removeToken', function () {
    it('errors when removeToken in background fails', async function () {
      sinon.stub(background, 'removeToken').callsArgWith(1, new Error('error'));
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.removeToken());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#setProviderType', function () {
    it('displays warning when setProviderType throws', async function () {
      const store = mockStore({ ecfWallet: { provider: {} } });
      const setProviderTypeSpy = sinon
        .stub(background, 'setProviderType')
        .callsArgWith(1, new Error('error'));
      const expectedActions = [
        { type: 'DISPLAY_WARNING', value: 'Had a problem changing networks!' },
      ];

      await store.dispatch(actions.setProviderType());
      assert(setProviderTypeSpy.calledOnce);
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#setRpcTarget', function () {
    it('displays warning when setRpcTarget throws', async function () {
      sinon
        .stub(background, 'setCustomRpc')
        .callsArgWith(4, new Error('error'));
      const store = mockStore();
      const expectedActions = [
        { type: 'DISPLAY_WARNING', value: 'Had a problem changing networks!' },
      ];

      await store.dispatch(actions.setRpcTarget());
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#addToAddressBook', function () {
    it('calls setAddressBook', async function () {
      const addToAddressBookSpy = sinon
        .stub(background, 'setAddressBook')
        .callsArgWith(4, null, true);
      const store = mockStore();
      await store.dispatch(actions.addToAddressBook('test'));
      assert(addToAddressBookSpy.calledOnce);
      addToAddressBookSpy.restore();
    });
  });

  describe('#exportAccount', function () {
    let exportAccountSpy;

    afterEach(function () {
      exportAccountSpy.restore();
    });

    it('exports with a single password check in the background', async function () {
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        {
          type: 'SHOW_PRIVATE_KEY',
          value:
            '7ec73b91bb20f209a7ff2d32f542c3420b4fccf14abcc7840d2eff0ebcb18505',
        },
      ];

      exportAccountSpy = sinon.spy(background, 'exportAccount');
      // Checking the password again in the UI would derive the key twice.
      const verifyPasswordSpy = sinon.spy(background, 'verifyPassword');
      // Re-unlocking would cancel any vault write still queued.
      const submitPasswordSpy = sinon.spy(background, 'submitPassword');

      await store.dispatch(
        actions.exportAccount(
          password,
          '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
        ),
      );
      verifyPasswordSpy.restore();
      submitPasswordSpy.restore();
      assert(verifyPasswordSpy.notCalled);
      assert(submitPasswordSpy.notCalled);
      assert(exportAccountSpy.calledOnce);
      assert.equal(exportAccountSpy.firstCall.args[1], password);
      assert.deepEqual(store.getActions(), expectedActions);
    });

    it('reports a wrong password as such', async function () {
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'Incorrect Password.' },
      ];

      exportAccountSpy = sinon.stub(background, 'exportAccount');
      exportAccountSpy.callsFake((_address, _password, callback) => {
        callback(new Error(INCORRECT_PASSWORD_MESSAGE));
      });

      await assert.rejects(async () => {
        await store.dispatch(
          actions.exportAccount(
            'wrong',
            '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
          ),
        );
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });

    it('reports any other failure as an export problem', async function () {
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        {
          type: 'DISPLAY_WARNING',
          value: 'Had a problem exporting the account.',
        },
      ];

      exportAccountSpy = sinon.stub(background, 'exportAccount');
      exportAccountSpy.callsFake((_address, _password, callback) => {
        callback(new Error('error'));
      });

      await assert.rejects(async () => {
        await store.dispatch(
          actions.exportAccount(
            password,
            '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
          ),
        );
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#setAccountLabel', function () {
    it('calls setAccountLabel', async function () {
      const setAccountLabelSpy = sinon
        .stub(background, 'setAccountLabel')
        .callsArgWith(2, null);
      const store = mockStore();
      await store.dispatch(
        actions.setAccountLabel(
          '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
          'test',
        ),
      );
      assert(setAccountLabelSpy.calledOnce);
    });
  });

  describe('#setFeatureFlag', function () {
    it('errors when setFeatureFlag in background throws', async function () {
      sinon
        .stub(background, 'setFeatureFlag')
        .callsArgWith(2, new Error('error'));
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];

      await assert.rejects(async () => {
        await store.dispatch(actions.setFeatureFlag());
      });
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#setCompletedOnboarding', function () {
    it('completes onboarding', async function () {
      const completeOnboardingSpy = sinon.stub(
        background,
        'completeOnboarding',
      );
      completeOnboardingSpy.callsFake((cb) => cb());
      const store = mockStore();
      await store.dispatch(actions.setCompletedOnboarding());
      assert.equal(completeOnboardingSpy.callCount, 1);
      completeOnboardingSpy.restore();
    });
  });

  describe('#updateCurrentLocale', function () {
    let setCurrentLocaleSpy;

    beforeEach(function () {
      sinon.stub(window, 'fetch').resolves({
        json: async () => enLocale,
      });
    });

    afterEach(function () {
      setCurrentLocaleSpy.restore();
      window.fetch.restore();
    });

    it('calls expected actions', async function () {
      const store = mockStore();
      setCurrentLocaleSpy = sinon.spy(background, 'setCurrentLocale');

      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        {
          type: 'SET_CURRENT_LOCALE',
          value: { locale: 'en', messages: enLocale },
        },
        { type: 'HIDE_LOADING_INDICATION' },
      ];

      await store.dispatch(actions.updateCurrentLocale('en'));
      assert(setCurrentLocaleSpy.calledOnce);
      assert.deepEqual(store.getActions(), expectedActions);
    });

    it('shows a warning and keeps the locale when setCurrentLocale fails', async function () {
      const store = mockStore();
      const expectedActions = [
        { type: 'SHOW_LOADING_INDICATION', value: undefined },
        { type: 'HIDE_LOADING_INDICATION' },
        { type: 'DISPLAY_WARNING', value: 'error' },
      ];
      setCurrentLocaleSpy = sinon.stub(background, 'setCurrentLocale');
      setCurrentLocaleSpy.callsFake((_, callback) => {
        callback(new Error('error'));
      });

      await store.dispatch(actions.updateCurrentLocale('en'));
      assert.deepEqual(store.getActions(), expectedActions);
    });
  });

  describe('#markPasswordForgotten', function () {
    it('enters the forgot-password flow', function () {
      assert.deepEqual(actions.markPasswordForgotten(), {
        type: 'FORGOT_PASSWORD',
        value: true,
      });
    });
  });

  describe('#unMarkPasswordForgotten', function () {
    it('leaves the forgot-password flow', function () {
      assert.deepEqual(actions.unMarkPasswordForgotten(), {
        type: 'FORGOT_PASSWORD',
        value: false,
      });
    });
  });

  describe('#editRpc', function () {
    it('stops and displays a warning when the old network cannot be removed', async function () {
      const store = mockStore();
      const delCustomRpcStub = sinon
        .stub(background, 'delCustomRpc')
        .callsArgWith(1, new Error('error'));
      const updateAndSetCustomRpcSpy = sinon.spy(
        background,
        'updateAndSetCustomRpc',
      );

      await store.dispatch(
        actions.editRpc('http://old.test', 'http://new.test', '0x1'),
      );
      delCustomRpcStub.restore();
      updateAndSetCustomRpcSpy.restore();

      assert(updateAndSetCustomRpcSpy.notCalled);
      assert.deepEqual(store.getActions(), [
        { type: 'DISPLAY_WARNING', value: 'Had a problem removing network!' },
      ]);
    });
  });

  describe('#completedTx', function () {
    it('counts the other pending approvals', function () {
      const store = mockStore({
        ecfWallet: {
          network: '1',
          unapprovedTxs: {
            1: { id: 1, time: 1, ecfWalletNetworkId: '1' },
            2: { id: 2, time: 2, ecfWalletNetworkId: '1' },
            3: { id: 3, time: 3, ecfWalletNetworkId: '2' },
          },
          unapprovedPersonalMsgs: { 4: { id: 4, time: 4 } },
          unapprovedTypedMessages: { 5: { id: 5, time: 5 } },
        },
      });

      store.dispatch(actions.completedTx(1));
      assert.deepEqual(store.getActions(), [
        { type: 'COMPLETED_TX', value: { id: 1, unconfirmedActionsCount: 3 } },
      ]);
    });
  });
});
