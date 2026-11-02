import { ObservableStore } from '@metamask/obs-store';
import { errorCodes } from '@metamask/rpc-errors';
import { strict as assert } from 'assert';
import EventEmitter from 'events';
import sinon from 'sinon';

import TransactionController from '../../../../../app/scripts/controllers/transactions';
import {
  TRANSACTION_TYPE_CANCEL,
  TRANSACTION_TYPE_RETRY,
} from '../../../../../app/scripts/controllers/transactions/enums';
import { decodeTransaction } from '../../../../../app/scripts/lib/transaction-codec';
import {
  TOKEN_METHOD_APPROVE,
  TOKEN_METHOD_TRANSFER,
  SEND_ETHER_ACTION_KEY,
  DEPLOY_CONTRACT_ACTION_KEY,
  CONTRACT_INTERACTION_KEY,
} from '../../../../../ui/app/helpers/constants/transactions';
import {
  createTestProviderTools,
  getTestAccounts,
} from '../../../../stub/provider';

const noop = () => true;
const currentNetworkId = '42';

describe('Transaction Controller', function () {
  let txController, provider, providerResultStub, fromAccount;

  beforeEach(function () {
    providerResultStub = {
      // 1 gwei
      eth_gasPrice: '0x0de0b6b3a7640000',
      // by default, all accounts are external accounts (not contracts)
      eth_getCode: '0x',
    };
    provider = createTestProviderTools({
      scaffold: providerResultStub,
    }).provider;
    fromAccount = getTestAccounts()[0];
    const blockTrackerStub = new EventEmitter();
    blockTrackerStub.getCurrentBlock = noop;
    blockTrackerStub.getLatestBlock = noop;
    txController = new TransactionController({
      provider,
      getGasPrice() {
        return '0xee6b2800';
      },
      networkStore: new ObservableStore(currentNetworkId),
      txHistoryLimit: 10,
      blockTracker: blockTrackerStub,
      signTransaction: async (ethTx) => ethTx.sign(fromAccount.key),
      getPermittedAccounts: () => undefined,
    });
    txController.nonceTracker.getNonceLock = () =>
      Promise.resolve({ nextNonce: 0, releaseLock: noop });
  });

  describe('#getState', function () {
    it('should return a state object with the right keys and data types', function () {
      const exposedState = txController.getState();
      assert.ok(
        Reflect.has(exposedState, 'unapprovedTxs'),
        'state should have the key unapprovedTxs',
      );
      assert.ok(
        Reflect.has(exposedState, 'currentNetworkTxList'),
        'state should have the key currentNetworkTxList',
      );
      assert.ok(
        typeof exposedState?.unapprovedTxs === 'object',
        'should be an object',
      );
      assert.ok(
        Array.isArray(exposedState.currentNetworkTxList),
        'should be an array',
      );
    });
  });

  describe('boot cleanup', function () {
    function createController(transactions) {
      const blockTracker = new EventEmitter();
      blockTracker.getCurrentBlock = noop;
      blockTracker.getLatestBlock = noop;
      return new TransactionController({
        initState: { transactions },
        provider,
        getGasPrice: () => '0xee6b2800',
        networkStore: new ObservableStore(currentNetworkId),
        txHistoryLimit: 10,
        blockTracker,
        signTransaction: noop,
        getPermittedAccounts: () => undefined,
      });
    }

    function txMeta(id, status, networkId = currentNetworkId) {
      return {
        id,
        status,
        time: id,
        ecfWalletNetworkId: networkId,
        txParams: { from: fromAccount.address, to: fromAccount.address },
        history: [{}],
      };
    }

    it('drops unapproved transactions on every network, whose sites were told to retry', function () {
      const controller = createController([
        txMeta(1, 'unapproved'),
        txMeta(2, 'unapproved', '5'),
        txMeta(3, 'confirmed'),
      ]);
      assert.deepEqual(
        controller.txStateManager.getFullTxList().map(({ id }) => id),
        [3],
      );
    });

    it('fails approved and signed transactions on every network', function () {
      const controller = createController([
        txMeta(1, 'approved'),
        txMeta(2, 'signed', '5'),
        txMeta(3, 'submitted'),
      ]);
      const statuses = Object.fromEntries(
        controller.txStateManager
          .getFullTxList()
          .map(({ id, status }) => [id, status]),
      );
      assert.deepEqual(statuses, { 1: 'failed', 2: 'failed', 3: 'submitted' });
    });

    it('leaves an approved transaction alone when the network changes', function () {
      const txId = 1;
      txController.txStateManager._saveTxList([txMeta(txId, 'approved')]);
      txController.networkStore.putState('5');
      txController.networkStore.putState(currentNetworkId);
      assert.equal(txController.txStateManager.getTx(txId).status, 'approved');
    });
  });

  describe('nonce tracker', function () {
    it('uses a new nonce tracker after the network changes', function () {
      const { nonceTracker } = txController;
      txController.networkStore.putState('5');
      assert.notEqual(txController.nonceTracker, nonceTracker);
      assert.equal(
        txController.pendingTxTracker.nonceTracker,
        txController.nonceTracker,
      );
    });
  });

  describe('#getUnapprovedTxCount', function () {
    it('should return the number of unapproved txs', function () {
      txController.txStateManager._saveTxList([
        {
          id: 1,
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 2,
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 3,
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
      ]);
      const unapprovedTxCount = txController.getUnapprovedTxCount();
      assert.equal(unapprovedTxCount, 3, 'should be 3');
    });
  });

  describe('#getConfirmedTransactions', function () {
    it('should return the number of confirmed txs', function () {
      const address = '0xc684832530fcbddae4b4230a47e991ddcec2831d';
      const txParams = {
        from: address,
        to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
      };
      txController.txStateManager._saveTxList([
        {
          id: 0,
          status: 'confirmed',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 1,
          status: 'confirmed',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 2,
          status: 'confirmed',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 3,
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 4,
          status: 'rejected',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 5,
          status: 'approved',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 6,
          status: 'signed',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 7,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
        {
          id: 8,
          status: 'failed',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
      ]);
      assert.equal(
        txController.txStateManager.getConfirmedTransactions(address).length,
        3,
      );
    });
  });

  describe('#newUnapprovedTransaction', function () {
    let stub, txMeta, txParams;

    beforeEach(function () {
      txParams = {
        from: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
        to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
      };
      txMeta = {
        status: 'unapproved',
        id: 1,
        ecfWalletNetworkId: currentNetworkId,
        txParams,
        history: [{}],
      };
      txController.txStateManager._saveTxList([txMeta]);
      stub = sinon
        .stub(txController, 'addUnapprovedTransaction')
        .callsFake(() => {
          txController.emit('newUnapprovedTx', txMeta);
          return Promise.resolve(txController.txStateManager.addTx(txMeta));
        });
    });

    afterEach(function () {
      txController.txStateManager._saveTxList([]);
      stub.restore();
    });

    it('should resolve when finished and status is submitted and resolve with the hash', async function () {
      txController.once('newUnapprovedTx', (txMetaFromEmit) => {
        setTimeout(() => {
          txController.setTxHash(txMetaFromEmit.id, '0x0');
          txController.txStateManager.setTxStatusSubmitted(txMetaFromEmit.id);
        });
      });

      const hash = await txController.newUnapprovedTransaction(txParams);
      assert.ok(hash, 'newUnapprovedTransaction needs to return the hash');
    });

    it('should reject when finished and status is rejected', async function () {
      txController.once('newUnapprovedTx', (txMetaFromEmit) => {
        setTimeout(() => {
          txController.txStateManager.setTxStatusRejected(txMetaFromEmit.id);
        });
      });

      await assert.rejects(
        () => txController.newUnapprovedTransaction(txParams),
        {
          message:
            'ecf-wallet Tx Signature: User denied transaction signature.',
        },
      );
    });
  });

  describe('#_getSecurityAlerts', function () {
    it('says so when the checks fail, instead of showing no alerts', async function () {
      txController.getSecurityContext = () => {
        throw new Error('broken');
      };
      assert.deepEqual(
        await txController._getSecurityAlerts({
          from: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          to: '0x5555555555555555555555555555555555555555',
        }),
        [{ id: 'alertSecurityChecksFailed', severity: 'warning', args: [] }],
      );
    });
  });

  describe('#addUnapprovedTransaction', function () {
    const selectedAddress = '0x1678a085c290ebd122dc42cba69373b5953b831d';

    let getSelectedAddress, getPermittedAccounts;

    beforeEach(function () {
      getSelectedAddress = sinon
        .stub(txController, 'getSelectedAddress')
        .returns(selectedAddress);
      getPermittedAccounts = sinon
        .stub(txController, 'getPermittedAccounts')
        .returns([selectedAddress]);
    });

    afterEach(function () {
      getSelectedAddress.restore();
      getPermittedAccounts.restore();
    });

    describe('requests from a site', function () {
      const origin = 'https://site.example';
      const noCodeRecipient = '0xc684832530fcbddae4b4230a47e991ddcec2831d';
      const failingParams = {
        from: selectedAddress,
        to: noCodeRecipient,
        data: '0xdeadbeef',
      };
      const validParams = { from: selectedAddress, to: noCodeRecipient };
      const unapprovedCount = () =>
        Object.keys(txController.txStateManager.getUnapprovedTxList()).length;

      it('stores nothing and opens no prompt when gas defaults fail', async function () {
        const prompted = sinon.spy();
        txController.on('newUnapprovedTx', prompted);

        for (let i = 0; i < 30; i++) {
          await assert.rejects(
            txController.addUnapprovedTransaction(failingParams, origin),
            /non-contract address/u,
          );
        }

        assert.equal(unapprovedCount(), 0);
        assert(prompted.notCalled);
      });

      it('keeps a wallet transaction when gas defaults fail', async function () {
        await assert.rejects(
          txController.addUnapprovedTransaction(failingParams, 'ecf-wallet'),
          /non-contract address/u,
        );

        assert.equal(unapprovedCount(), 1);
      });

      it('stores nothing when fee lookup fails', async function () {
        sinon
          .stub(txController, '_getDefaultFees')
          .rejects(new Error('no fees'));

        await assert.rejects(
          txController.addUnapprovedTransaction(validParams, origin),
          /no fees/u,
        );

        assert.equal(unapprovedCount(), 0);
      });

      it('answers a waiting request when unapproved transactions are cleared', async function () {
        sinon
          .stub(txController, 'addTxGasDefaults')
          .callsFake(async (txMeta) => txMeta);
        sinon.stub(txController, '_simulateTransaction');
        const stored = new Promise((resolve) =>
          txController.once('newUnapprovedTx', resolve),
        );
        const request = txController.newUnapprovedTransaction(validParams, {
          origin,
        });
        await stored;

        // The request starts listening once its transaction has been stored.
        await new Promise((resolve) => setImmediate(resolve));
        txController.txStateManager.clearUnapprovedTxs();

        await assert.rejects(request, {
          code: errorCodes.provider.userRejectedRequest,
        });
        assert.equal(unapprovedCount(), 0);
      });

      it('simulates a stored transaction', async function () {
        const simulate = sinon.stub(txController, '_simulateTransaction');

        const txMeta = await txController.addUnapprovedTransaction(
          validParams,
          origin,
        );

        assert(simulate.calledOnceWithExactly(txMeta.id));
      });

      it('stores a transaction with its defaults applied', async function () {
        const txMeta = await txController.addUnapprovedTransaction(
          validParams,
          origin,
        );

        const stored = txController.txStateManager.getTx(txMeta.id);
        assert.equal(stored.loadingDefaults, false);
        assert.ok(stored.txParams.gas);
      });
    });

    it('should add an unapproved transaction and return a valid txMeta', async function () {
      const txMeta = await txController.addUnapprovedTransaction({
        from: selectedAddress,
        to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
      });
      assert.ok(Reflect.has(txMeta, 'id'), 'should have a id');
      assert.ok(Reflect.has(txMeta, 'time'), 'should have a time stamp');
      assert.ok(
        Reflect.has(txMeta, 'ecfWalletNetworkId'),
        'should have a ecfWalletNetworkId',
      );
      assert.ok(Reflect.has(txMeta, 'txParams'), 'should have a txParams');
      assert.ok(Reflect.has(txMeta, 'history'), 'should have a history');
      assert.equal(
        txMeta.txParams.value,
        '0x0',
        'should have added 0x0 as the value',
      );

      const memTxMeta = txController.txStateManager.getTx(txMeta.id);
      assert.deepEqual(txMeta, memTxMeta);
    });

    it('attaches on-device security alerts before the transaction is shown', async function () {
      const friend = '0xabcd000000000000000000000000000000001234';
      txController.getSecurityContext = () => ({
        ownAccounts: new Set([selectedAddress]),
        contacts: new Set([friend]),
        tokenContracts: new Set(),
      });
      const lookalike = await txController.addUnapprovedTransaction({
        from: selectedAddress,
        to: '0xabcd999999999999999999999999999999991234',
      });
      assert.deepEqual(
        lookalike.securityAlerts.map(({ id }) => id),
        ['alertLookalikeAddress'],
      );
      const contact = await txController.addUnapprovedTransaction({
        from: selectedAddress,
        to: friend,
      });
      assert.deepEqual(contact.securityAlerts, []);
    });

    it('refuses an approval that changes who receives the funds', async function () {
      const txMeta = await txController.addUnapprovedTransaction({
        from: selectedAddress,
        to: '0x5555555555555555555555555555555555555555',
      });
      const changed = {
        ...txMeta,
        txParams: {
          ...txMeta.txParams,
          to: '0x6666666666666666666666666666666666666666',
        },
      };
      await assert.rejects(
        txController.updateAndApproveTransaction(changed),
        /recipient changed/u,
      );
      assert.equal(
        txController.txStateManager.getTx(txMeta.id).status,
        'unapproved',
      );
    });

    describe('edits to a reviewed approval', function () {
      const spender = `${'0'.repeat(24)}${'2f318c334780961fb129d2a6c30d0763d9a5c970'}`;
      const approve = (amount, rest = '') =>
        `0x095ea7b3${spender}${amount.padStart(64, '0')}${rest}`;
      const tx = (data) => ({ txParams: { to: '0x5555', data } });
      const unlimited = approve('f'.repeat(64));

      it('allows changing only the amount', function () {
        txController._assertOnlyApprovalAmountChanged(
          tx(unlimited.toUpperCase().replace('0X', '0x')),
          tx(approve('8ac7230489e80000')),
        );
        txController._assertOnlyApprovalAmountChanged(
          tx(approve('f'.repeat(64), 'abcd')),
          tx(approve('1', 'abcd')),
        );
      });

      it('refuses changing anything but the amount', function () {
        const edits = [
          // trailing calldata
          approve('1', '00'),
          // spender
          `0x095ea7b3${'1'.repeat(64)}${'1'.padStart(64, '0')}`,
          // selector: increaseAllowance instead of approve
          `0x39509351${spender}${'1'.padStart(64, '0')}`,
          // truncated
          unlimited.slice(0, -2),
          undefined,
        ];
        edits.forEach((data) => {
          assert.throws(
            () =>
              txController._assertOnlyApprovalAmountChanged(
                tx(unlimited),
                tx(data),
              ),
            /Only the spending limit/u,
          );
        });
      });

      it('leaves other transactions alone', function () {
        txController._assertOnlyApprovalAmountChanged(
          tx('0x1234'),
          tx('0x5678'),
        );
        txController._assertOnlyApprovalAmountChanged(tx(undefined), tx('0x'));
      });
    });

    it('should emit newUnapprovedTx event and pass txMeta as the first argument', function (done) {
      providerResultStub.eth_gasPrice = '0x4a817c800';
      txController.once('newUnapprovedTx', (txMetaFromEmit) => {
        assert.ok(txMetaFromEmit, 'txMeta is falsy');
        done();
      });
      txController
        .addUnapprovedTransaction({
          from: selectedAddress,
          to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
        })
        // eslint-disable-next-line promise/no-callback-in-promise -- done is also called by the event listener; this only reports a rejection
        .catch(done);
    });

    it("should fail if the from address isn't the selected address", async function () {
      await assert.rejects(() =>
        txController.addUnapprovedTransaction({
          from: '0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2',
        }),
      );
    });

    it('should fail if netId is loading', async function () {
      txController.networkStore = new ObservableStore('loading');
      await assert.rejects(
        () =>
          txController.addUnapprovedTransaction({
            from: selectedAddress,
            to: '0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2',
          }),
        { message: 'ecf-wallet is having trouble connecting to the network' },
      );
    });
  });

  describe('#addTxGasDefaults', function () {
    it('should add the tx defaults if their are none', async function () {
      txController.txStateManager._saveTxList([
        {
          id: 1,
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
      ]);
      const txMeta = {
        id: 1,
        txParams: {
          from: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
          to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
        },
        history: [{}],
      };
      providerResultStub.eth_gasPrice = '0x4a817c800';
      providerResultStub.eth_getBlockByNumber = { gasLimit: '47b784' };
      providerResultStub.eth_estimateGas = '5209';

      const txMetaWithDefaults = await txController.addTxGasDefaults(txMeta);
      assert.ok(
        txMetaWithDefaults.txParams.gasPrice,
        'should have added the gas price',
      );
      assert.ok(
        txMetaWithDefaults.txParams.gas,
        'should have added the gas field',
      );
    });
  });

  describe('#addTx', function () {
    it('should emit updates', async function () {
      const txMeta = {
        id: '1',
        status: 'unapproved',
        ecfWalletNetworkId: currentNetworkId,
        txParams: {},
      };

      const eventNames = ['update:badge', '1:unapproved'];
      const listeners = [];
      eventNames.forEach((eventName) => {
        listeners.push(
          new Promise((resolve) => {
            txController.once(eventName, (arg) => {
              resolve(arg);
            });
          }),
        );
      });
      txController.addTx(txMeta);
      const returnValues = await Promise.all(listeners);
      assert.deepEqual(
        returnValues.pop(),
        txMeta,
        'last event 1:unapproved should return txMeta',
      );
    });
  });

  describe('#approveTransaction', function () {
    it('does not overwrite set values', async function () {
      const originalValue = '0x01';
      const txMeta = {
        id: '1',
        status: 'unapproved',
        ecfWalletNetworkId: currentNetworkId,
        txParams: {
          nonce: originalValue,
          gas: originalValue,
          gasPrice: originalValue,
        },
      };
      this.timeout(15000);
      const wrongValue = '0x05';

      txController.addTx(txMeta);
      providerResultStub.eth_gasPrice = wrongValue;
      providerResultStub.eth_estimateGas = '0x5209';

      const signStub = sinon
        .stub(txController, 'signTransaction')
        .callsFake(() => Promise.resolve());

      const pubStub = sinon
        .stub(txController, 'publishTransaction')
        .callsFake(() => {
          txController.setTxHash('1', originalValue);
          txController.txStateManager.setTxStatusSubmitted('1');
        });

      await txController.approveTransaction(txMeta.id);
      const result = txController.txStateManager.getTx(txMeta.id);
      const params = result.txParams;

      // A nonce already in the params,
      // such as one a site supplied, is used instead of the next nonce.
      assert.equal(params.nonce, originalValue, 'nonce unmodified');
      assert.equal(params.gas, originalValue, 'gas unmodified');
      assert.equal(params.gasPrice, originalValue, 'gas price unmodified');
      assert.equal(result.hash, originalValue);
      assert.equal(
        result.status,
        'submitted',
        'should have reached the submitted status.',
      );
      signStub.restore();
      pubStub.restore();
    });

    it('preserves a supplied nonce', async function () {
      txController.addTx({
        id: '2',
        status: 'unapproved',
        ecfWalletNetworkId: currentNetworkId,
        txParams: { nonce: '0x01', gas: '0x01', gasPrice: '0x01' },
      });
      const lockStub = sinon
        .stub(txController.nonceTracker, 'getNonceLock')
        .resolves({
          nextNonce: 3,
          nonceDetails: {},
          releaseLock: () => undefined,
        });
      const signStub = sinon
        .stub(txController, 'signTransaction')
        .callsFake(() => Promise.resolve());
      const pubStub = sinon
        .stub(txController, 'publishTransaction')
        .callsFake(() => {
          txController.setTxHash('2', '0x02');
          txController.txStateManager.setTxStatusSubmitted('2');
        });

      await txController.approveTransaction('2');

      assert.equal(
        txController.txStateManager.getTx('2').txParams.nonce,
        '0x01',
      );
      lockStub.restore();
      signStub.restore();
      pubStub.restore();
    });
  });

  describe('#sign replay-protected tx', function () {
    it('prepares a tx with the chainId set', async function () {
      txController.addTx(
        {
          id: '1',
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {
            from: fromAccount.address,
            to: '0xc684832530fcbddae4b4230a47e991ddcec2831d',
          },
        },
        noop,
      );
      const rawTx = await txController.signTransaction('1');
      // Decoding rejects an EIP-155 signature for any other chain.
      const ethTx = decodeTransaction(rawTx, 42);
      assert.equal(Number(ethTx.common.chainId()), 42);
      assert.throws(
        () => decodeTransaction(rawTx, 1),
        /Incompatible EIP155-based V/u,
      );
    });
  });

  describe('#updateAndApproveTransaction', function () {
    it('should update and approve transactions', async function () {
      const txMeta = {
        id: 1,
        status: 'unapproved',
        txParams: {
          from: fromAccount.address,
          to: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          gasPrice: '0x77359400',
          gas: '0x7b0d',
          nonce: '0x0',
        },
        ecfWalletNetworkId: currentNetworkId,
      };
      txController.txStateManager.addTx(txMeta);
      const approvalPromise = txController.updateAndApproveTransaction(txMeta);
      const tx = txController.txStateManager.getTx(1);
      assert.equal(tx.status, 'approved');
      await approvalPromise;
    });

    function unapprovedTx(id) {
      txController.txStateManager.addTx({
        id,
        status: 'unapproved',
        origin: 'https://dapp.example',
        securityAlerts: [{ id: 'alertExample' }],
        txParams: {
          from: fromAccount.address,
          to: '0x1678a085c290ebd122dc42cba69373b5953b831d',
          gasPrice: '0x77359400',
          gas: '0x7b0d',
        },
        ecfWalletNetworkId: currentNetworkId,
      });
      return txController.txStateManager.getTx(id);
    }

    it('refuses a stale copy of a transaction that was already approved', async function () {
      const txMeta = unapprovedTx(2);
      const staleCopy = JSON.parse(JSON.stringify(txMeta));
      const signing = sinon.stub(txController, 'signTransaction').resolves();
      const publishing = sinon
        .stub(txController, 'publishTransaction')
        .callsFake(async (txId) =>
          txController.txStateManager.setTxStatusSubmitted(txId),
        );
      try {
        await txController.updateAndApproveTransaction(
          JSON.parse(JSON.stringify(txMeta)),
        );
        const submitted = txController.txStateManager.getTx(txMeta.id);
        assert.equal(submitted.status, 'submitted');

        await assert.rejects(
          txController.updateAndApproveTransaction(staleCopy),
          /not awaiting approval/u,
        );
        await assert.rejects(
          txController.updateTransaction(staleCopy),
          /not awaiting approval/u,
        );
        const stored = txController.txStateManager.getTx(txMeta.id);
        assert.equal(stored.status, 'submitted');
        assert.equal(stored.txParams.nonce, submitted.txParams.nonce);
        assert.equal(signing.callCount, 1);
      } finally {
        signing.restore();
        publishing.restore();
      }
    });

    it('keeps the wallet-owned fields of the stored transaction', async function () {
      const txMeta = unapprovedTx(3);
      await txController.updateTransaction({
        ...txMeta,
        origin: 'https://other.example',
        securityAlerts: [],
        txParams: { ...txMeta.txParams, gas: '0x5209' },
      });
      const stored = txController.txStateManager.getTx(txMeta.id);
      assert.equal(stored.txParams.gas, '0x5209');
      assert.equal(stored.origin, txMeta.origin);
      assert.deepEqual(stored.securityAlerts, txMeta.securityAlerts);
    });
  });

  describe('balance-change preview', function () {
    const recipient = '0x1678a085c290ebd122dc42cba69373b5953b831d';

    function addUnapproved(id) {
      txController.txStateManager.addTx({
        id,
        status: 'unapproved',
        origin: 'https://dapp.example',
        txParams: {
          from: fromAccount.address,
          to: recipient,
          value: '0x1',
          gasPrice: '0x77359400',
          gas: '0x7b0d',
        },
        ecfWalletNetworkId: currentNetworkId,
      });
      return txController.txStateManager.getTx(id);
    }

    async function waitForSimulation(id) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const { simulation } = txController.txStateManager.getTx(id);
        if (simulation && simulation.status !== 'loading') {
          return simulation;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('The simulation did not finish');
    }

    it("stores the simulation from the wallet's provider", async function () {
      const from = `0x${fromAccount.address.slice(2).padStart(64, '0')}`;
      const to = `0x${recipient.slice(2).padStart(64, '0')}`;
      providerResultStub.eth_simulateV1 = [
        {
          calls: [
            {
              status: '0x1',
              logs: [
                {
                  address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                  topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    from,
                    to,
                  ],
                  data: `0x${'1'.padStart(64, '0')}`,
                },
              ],
            },
          ],
        },
      ];
      addUnapproved(10);
      txController._simulateTransaction(10);
      assert.equal(
        txController.txStateManager.getTx(10).simulation.status,
        'loading',
      );
      const simulation = await waitForSimulation(10);
      assert.equal(simulation.status, 'success');
      assert.deepEqual(simulation.changes, [
        { standard: 'native', amount: '-1' },
      ]);
    });

    it('runs again only for edits the preview depends on', async function () {
      const txMeta = addUnapproved(11);
      const simulate = sinon.stub(txController, '_simulateTransaction');
      try {
        await txController.updateTransaction({
          ...txMeta,
          txParams: { ...txMeta.txParams, gasPrice: '0x77359401' },
        });
        assert.equal(simulate.callCount, 0);
        await txController.updateTransaction({
          ...txController.txStateManager.getTx(11),
          txParams: { ...txMeta.txParams, value: '0x2' },
        });
        assert.equal(simulate.callCount, 1);
      } finally {
        simulate.restore();
      }
    });

    it('ignores a preview sent back by the UI', async function () {
      const txMeta = addUnapproved(12);
      await txController.updateTransaction({
        ...txMeta,
        simulation: { status: 'success', changes: [], approvals: [] },
      });
      assert.equal(txController.txStateManager.getTx(12).simulation, undefined);
    });
  });

  describe('#getChainId', function () {
    it('returns 0 when the chainId is NaN', function () {
      txController.networkStore = new ObservableStore(NaN);
      assert.equal(txController.getChainId(), 0);
    });
  });

  describe('#cancelTransaction', function () {
    it('should emit a status change to rejected', function (done) {
      txController.txStateManager._saveTxList([
        {
          id: 0,
          status: 'unapproved',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
        {
          id: 1,
          status: 'rejected',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
        {
          id: 2,
          status: 'approved',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
        {
          id: 3,
          status: 'signed',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
        {
          id: 4,
          status: 'submitted',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
        {
          id: 5,
          status: 'confirmed',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
        {
          id: 6,
          status: 'failed',
          txParams: {},
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
        },
      ]);

      txController.once('tx:status-update', (txId, status) => {
        try {
          assert.equal(status, 'rejected', 'status should e rejected');
          assert.equal(txId, 0, 'id should e 0');
          done();
        } catch (e) {
          done(e);
        }
      });

      txController.cancelTransaction(0);
    });
  });

  describe('#createSpeedUpTransaction', function () {
    let addTxSpy;
    let approveTransactionSpy;
    let txParams;
    let expectedTxParams;

    beforeEach(function () {
      addTxSpy = sinon.spy(txController, 'addTx');
      approveTransactionSpy = sinon.spy(txController, 'approveTransaction');

      txParams = {
        nonce: '0x00',
        // The signer signs with this account's key.
        from: fromAccount.address,
        to: '0xB09d8505E1F4EF1CeA089D47094f5DD3464083d4',
        gas: '0x5209',
        gasPrice: '0xa',
      };
      txController.txStateManager._saveTxList([
        {
          id: 1,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
      ]);

      expectedTxParams = { ...txParams, gasPrice: '0xb' };
    });

    afterEach(function () {
      addTxSpy.restore();
      approveTransactionSpy.restore();
    });

    it('should call this.addTx and this.approveTransaction with the expected args', async function () {
      await txController.createSpeedUpTransaction(1);
      assert.equal(addTxSpy.callCount, 1);

      const addTxArgs = addTxSpy.getCall(0).args[0];
      assert.deepEqual(addTxArgs.txParams, expectedTxParams);

      const { lastGasPrice, type } = addTxArgs;
      assert.deepEqual(
        { lastGasPrice, type },
        {
          lastGasPrice: '0xa',
          type: TRANSACTION_TYPE_RETRY,
        },
      );
    });

    it('should call this.approveTransaction with the id of the returned tx', async function () {
      const result = await txController.createSpeedUpTransaction(1);
      assert.equal(approveTransactionSpy.callCount, 1);

      const approveTransactionArg = approveTransactionSpy.getCall(0).args[0];
      assert.equal(result.id, approveTransactionArg);
    });
  });

  describe('#createCancelTransaction', function () {
    it('should create a cancel transaction that replaces the original nonce', async function () {
      const txParams = {
        nonce: '0x00',
        from: fromAccount.address,
        to: '0xB09d8505E1F4EF1CeA089D47094f5DD3464083d4',
        gas: '0x5209',
        gasPrice: '0xa',
      };
      txController.txStateManager._saveTxList([
        {
          id: 1,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          txParams,
          history: [{}],
        },
      ]);
      const approveTransactionStub = sinon
        .stub(txController, 'approveTransaction')
        .resolves();

      const result = await txController.createCancelTransaction(1);
      approveTransactionStub.restore();

      assert.ok(approveTransactionStub.calledOnceWithExactly(result.id));
      assert.deepEqual(result.txParams, {
        from: txParams.from,
        to: txParams.from,
        nonce: '0x00',
        gas: '0x5208',
        value: '0x0',
        gasPrice: '0xb',
      });
      assert.equal(result.lastGasPrice, '0xa');
      assert.equal(result.type, TRANSACTION_TYPE_CANCEL);
      assert.equal(result.status, 'approved');
    });
  });

  describe('#publishTransaction', function () {
    let hash, txMeta;

    beforeEach(function () {
      hash =
        '0x2a5523c6fa98b47b7d9b6c8320179785150b42a16bcff36b398c5062b65657e8';
      txMeta = {
        id: 1,
        status: 'unapproved',
        txParams: {},
        ecfWalletNetworkId: currentNetworkId,
      };
      providerResultStub.eth_sendRawTransaction = hash;
    });

    it('should publish a tx, updates the rawTx when provided a one', async function () {
      const rawTx =
        '0x477b2e6553c917af0db0388ae3da62965ff1a184558f61b749d1266b2e6d024c';
      txController.txStateManager.addTx(txMeta);
      await txController.publishTransaction(txMeta.id, rawTx);
      const publishedTx = txController.txStateManager.getTx(1);
      assert.equal(publishedTx.hash, hash);
      assert.equal(publishedTx.status, 'submitted');
    });

    it('should ignore the error "Transaction Failed: known transaction" and be as usual', async function () {
      providerResultStub.eth_sendRawTransaction = async (_, __, ___, end) => {
        end(new Error('Transaction Failed: known transaction'));
      };
      const rawTx =
        '0xf86204831e848082520894f231d46dd78806e1dd93442cf33c7671f853874880802ca05f973e540f2d3c2f06d3725a626b75247593cb36477187ae07ecfe0a4db3cf57a00259b52ee8c58baaa385fb05c3f96116e58de89bcc165cb3bfdfc708672fed8a';
      txController.txStateManager.addTx(txMeta);
      await txController.publishTransaction(txMeta.id, rawTx);
      const publishedTx = txController.txStateManager.getTx(1);
      assert.equal(
        publishedTx.hash,
        '0x2cc5a25744486f7383edebbf32003e5a66e18135799593d6b5cdd2bb43674f09',
      );
      assert.equal(publishedTx.status, 'submitted');
    });
  });

  describe('#_markNonceDuplicatesDropped', function () {
    it('should mark all nonce duplicates as dropped without marking the confirmed transaction as dropped', function () {
      txController.txStateManager._saveTxList([
        {
          id: 1,
          status: 'confirmed',
          ecfWalletNetworkId: currentNetworkId,
          hash: '0xabc',
          history: [{}],
          txParams: { nonce: '0x01' },
        },
        {
          id: 2,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
          txParams: { nonce: '0x01' },
        },
        {
          id: 3,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
          txParams: { nonce: '0x01' },
        },
        {
          id: 4,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
          txParams: { nonce: '0x01' },
        },
        {
          id: 5,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
          txParams: { nonce: '0x01' },
        },
        {
          id: 6,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
          txParams: { nonce: '0x01' },
        },
        {
          id: 7,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          history: [{}],
          txParams: { nonce: '0x01' },
        },
      ]);
      txController._markNonceDuplicatesDropped(1);
      const confirmedTx = txController.txStateManager.getTx(1);
      const droppedTxs = txController.txStateManager.getFilteredTxList({
        nonce: '0x01',
        status: 'dropped',
      });
      assert.equal(
        confirmedTx.status,
        'confirmed',
        'the confirmedTx should remain confirmed',
      );
      assert.equal(droppedTxs.length, 6, 'their should be 6 dropped txs');
      droppedTxs.forEach((droppedTx) => {
        assert.equal(droppedTx.replacedBy, '0xabc');
        const [entry] = droppedTx.history.filter((ops) =>
          ops[0]?.note?.includes('reference to confirmed txHash'),
        );
        assert.ok(
          entry.some(
            ({ path, value }) => path === '/replacedBy' && value === '0xabc',
          ),
          'the replacedBy hash should be recorded on the dropped tx',
        );
      });
      assert.equal(
        confirmedTx.history.length,
        1,
        'the confirmedTx should not be updated',
      );
    });
  });

  describe('#_determineTransactionCategory', function () {
    it('should return a simple send transactionCategory when to is truthy but data is falsy', async function () {
      const result = await txController._determineTransactionCategory({
        to: '0xabc',
        data: '',
      });
      assert.deepEqual(result, {
        transactionCategory: SEND_ETHER_ACTION_KEY,
        getCodeResponse: '0x',
      });
    });

    it('should return a token transfer transactionCategory when data is for the respective method call', async function () {
      const result = await txController._determineTransactionCategory({
        to: '0xabc',
        data: '0xa9059cbb0000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C970000000000000000000000000000000000000000000000000000000000000000a',
      });
      assert.deepEqual(result, {
        transactionCategory: TOKEN_METHOD_TRANSFER,
        getCodeResponse: undefined,
      });
    });

    it('should return a token approve transactionCategory when data is for the respective method call', async function () {
      const result = await txController._determineTransactionCategory({
        to: '0xabc',
        data: '0x095ea7b30000000000000000000000002f318C334780961FB129D2a6c30D0763d9a5C9700000000000000000000000000000000000000000000000000000000000000005',
      });
      assert.deepEqual(result, {
        transactionCategory: TOKEN_METHOD_APPROVE,
        getCodeResponse: undefined,
      });
    });

    it('should return a contract deployment transactionCategory when to is falsy and there is data', async function () {
      const result = await txController._determineTransactionCategory({
        to: '',
        data: '0xabd',
      });
      assert.deepEqual(result, {
        transactionCategory: DEPLOY_CONTRACT_ACTION_KEY,
        getCodeResponse: undefined,
      });
    });

    it('should return a simple send transactionCategory with a 0x getCodeResponse when there is data and but the to address is not a contract address', async function () {
      const result = await txController._determineTransactionCategory({
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: '0xabd',
      });
      assert.deepEqual(result, {
        transactionCategory: SEND_ETHER_ACTION_KEY,
        getCodeResponse: '0x',
      });
    });

    it('should return a simple send transactionCategory with a null getCodeResponse when to is truthy and there is data and but getCode returns an error', async function () {
      providerResultStub.eth_getCode = async (_, __, ___, end) => {
        end(new Error('getCode failed'));
      };
      const result = await txController._determineTransactionCategory({
        to: '0xabc',
        data: '0xabd',
      });
      assert.deepEqual(result, {
        transactionCategory: SEND_ETHER_ACTION_KEY,
        getCodeResponse: null,
      });
    });

    it('should return a contract interaction transactionCategory with the correct getCodeResponse when to is truthy and there is data and it is not a token transaction', async function () {
      const _providerResultStub = {
        // 1 gwei
        eth_gasPrice: '0x0de0b6b3a7640000',
        // by default, all accounts are external accounts (not contracts)
        eth_getCode: '0x0a',
      };
      const _provider = createTestProviderTools({
        scaffold: _providerResultStub,
      }).provider;
      const _fromAccount = getTestAccounts()[0];
      const _blockTrackerStub = new EventEmitter();
      _blockTrackerStub.getCurrentBlock = noop;
      _blockTrackerStub.getLatestBlock = noop;
      const _txController = new TransactionController({
        provider: _provider,
        getGasPrice() {
          return '0xee6b2800';
        },
        networkStore: new ObservableStore(currentNetworkId),
        txHistoryLimit: 10,
        blockTracker: _blockTrackerStub,
        signTransaction: async (ethTx) => ethTx.sign(_fromAccount.key),
      });
      const result = await _txController._determineTransactionCategory({
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: 'abd',
      });
      assert.deepEqual(result, {
        transactionCategory: CONTRACT_INTERACTION_KEY,
        getCodeResponse: '0x0a',
      });
    });

    it('should return a contract interaction transactionCategory with the correct getCodeResponse when to is a contract address and data is falsy', async function () {
      const _providerResultStub = {
        // 1 gwei
        eth_gasPrice: '0x0de0b6b3a7640000',
        // by default, all accounts are external accounts (not contracts)
        eth_getCode: '0x0a',
      };
      const _provider = createTestProviderTools({
        scaffold: _providerResultStub,
      }).provider;
      const _fromAccount = getTestAccounts()[0];
      const _blockTrackerStub = new EventEmitter();
      _blockTrackerStub.getCurrentBlock = noop;
      _blockTrackerStub.getLatestBlock = noop;
      const _txController = new TransactionController({
        provider: _provider,
        getGasPrice() {
          return '0xee6b2800';
        },
        networkStore: new ObservableStore(currentNetworkId),
        txHistoryLimit: 10,
        blockTracker: _blockTrackerStub,
        signTransaction: async (ethTx) => ethTx.sign(_fromAccount.key),
      });
      const result = await _txController._determineTransactionCategory({
        to: '0x9e673399f795D01116e9A8B2dD2F156705131ee9',
        data: '',
      });
      assert.deepEqual(result, {
        transactionCategory: CONTRACT_INTERACTION_KEY,
        getCodeResponse: '0x0a',
      });
    });
  });

  describe('#getPendingTransactions', function () {
    it('should show only submitted and approved transactions as pending transaction', function () {
      txController.txStateManager._saveTxList([
        {
          id: 1,
          status: 'unapproved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
        },
        {
          id: 2,
          status: 'rejected',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 3,
          status: 'approved',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 4,
          status: 'signed',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 5,
          status: 'submitted',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 6,
          status: 'confirmed',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
        {
          id: 7,
          status: 'failed',
          ecfWalletNetworkId: currentNetworkId,
          txParams: {},
          history: [{}],
        },
      ]);

      assert.equal(
        txController.pendingTxTracker.getPendingTransactions().length,
        2,
      );
      const states = txController.pendingTxTracker
        .getPendingTransactions()
        .map((tx) => tx.status);
      assert.ok(states.includes('approved'), 'includes approved');
      assert.ok(states.includes('submitted'), 'includes submitted');
    });
  });
});
