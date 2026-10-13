import * as ethUtil from '@ethereumjs/util';
import EthQuery from '@metamask/eth-query';
import { NonceTracker } from '@metamask/nonce-tracker';
import { ObservableStore } from '@metamask/obs-store';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import EventEmitter from '@metamask/safe-event-emitter';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3.js';
import BN from 'bn.js';
import abi from 'human-standard-token-abi';
import log from 'loglevel';
import pify from 'pify';

import {
  TRANSACTION_TYPE_CANCEL,
  TRANSACTION_TYPE_RETRY,
  TRANSACTION_TYPE_STANDARD,
  TRANSACTION_STATUS_UNAPPROVED,
  TRANSACTION_STATUS_APPROVED,
} from './enums';
import * as txUtils from './lib/util';
import PendingTransactionTracker from './pending-tx-tracker';
import TxGasUtil from './tx-gas-utils';
import TransactionStateManager from './tx-state-manager';
import { TRANSACTION_NO_CONTRACT_ERROR_KEY } from '../../../../ui/app/helpers/constants/error-keys';
import {
  TOKEN_METHOD_APPROVE,
  TOKEN_METHOD_TRANSFER,
  TOKEN_METHOD_TRANSFER_FROM,
  SEND_ETHER_ACTION_KEY,
  DEPLOY_CONTRACT_ACTION_KEY,
  CONTRACT_INTERACTION_KEY,
} from '../../../../ui/app/helpers/constants/transactions';
import createMethodDecoder from '../../lib/abi-method-decoder';
import cleanErrorStack from '../../lib/cleanErrorStack';
import {
  checksFailedAlert,
  decodeCall,
  getTransactionAlerts,
} from '../../lib/security-checks';
import { createTransaction } from '../../lib/transaction-codec';
import {
  isFeeMarketTransaction,
  replacementFees,
} from '../../lib/transaction-fees';
import { bnToHex, hexToBn } from '../../lib/util';

const decodeTokenMethod = createMethodDecoder(abi);

const SIMPLE_GAS_COST = '0x5208'; // Hex for 21000, cost of a simple send.
// Priority fee estimate: median of the 20th-percentile tip over recent blocks,
// matching upstream MetaMask's "medium" fee-history estimate.
const FEE_HISTORY_BLOCKS = 5;
const PRIORITY_FEE_PERCENTILE = 20;
const MAX_MEMSTORE_TX_LIST_SIZE = 100; // Number of transactions (by unique nonces) to keep in memory

/**
 * Applies default fees to tx params; fee-market params drop any gas price.
 *
 * @param {object} txParams - The tx params, modified in place
 * @param {object} fees - The fee fields to apply
 * @returns {object} The tx params
 */
function applyFees(txParams, fees) {
  Object.assign(txParams, fees);
  if (isFeeMarketTransaction(txParams)) {
    delete txParams.gasPrice;
  }
  return txParams;
}

/**
 * Transaction Controller is an aggregate of sub-controllers and trackers
 * composing them in a way to be exposed to the EcfWalletController
 * <br>- txStateManager
 * responsible for the state of a transaction and
 * storing the transaction
 * <br>- pendingTxTracker
 * watching blocks for transactions to be include
 * and emitting confirmed events
 * <br>- txGasUtil
 * gas calculations and safety buffering
 * <br>- nonceTracker
 * calculating nonces
 *
 * @class
 * @param {object} opts - Controller options.
 * @param {object} opts.initState - initial transaction list default is an empty array
 * @param {object} opts.networkStore - an observable store for network number
 * @param {object} opts.blockTracker - An instance of eth-blocktracker
 * @param {object} opts.provider - A network provider.
 * @param {Function} opts.signTransaction - ethTx signer that returns a rawTx
 * @param {Function} opts.getPermittedAccounts - get accounts that an origin has permissions for
 * @param {Function} [opts.getChainId] - Returns the chain ID to sign for; defaults to the network store's state
 * @param {Function} [opts.getSecurityContext] - Returns the addresses the transaction checks compare against
 * @param {number} [opts.txHistoryLimit] - number *optional* for limiting how many transactions are in state
 * @param {object} opts.preferencesStore - The preferences controller store.
 */

export default class TransactionController extends EventEmitter {
  constructor(opts) {
    super();
    this.networkStore = opts.networkStore || new ObservableStore({});
    this.preferencesStore = opts.preferencesStore || new ObservableStore({});
    this.provider = opts.provider;
    this.getSigningChainId = opts.getChainId;
    this.getPermittedAccounts = opts.getPermittedAccounts;
    this.getSecurityContext = opts.getSecurityContext;
    this.blockTracker = opts.blockTracker;
    this.signEthTx = opts.signTransaction;
    this.inProcessOfSigning = new Set();
    this.networkGeneration = 0;

    this.memStore = new ObservableStore({});
    this.query = pify(new EthQuery(this.provider));
    this.txGasUtil = new TxGasUtil(this.provider);

    this._mapMethods();
    this.txStateManager = new TransactionStateManager({
      initState: opts.initState,
      txHistoryLimit: opts.txHistoryLimit,
      getNetwork: this.getNetwork.bind(this),
    });
    this._onBootCleanUp();

    this.store = this.txStateManager.store;
    this.nonceTracker = this._createNonceTracker();

    this.pendingTxTracker = new PendingTransactionTracker({
      provider: this.provider,
      nonceTracker: this.nonceTracker,
      publishTransaction: (rawTx) => this.query.sendRawTransaction(rawTx),
      getPendingTransactions: () => {
        const pending = this.txStateManager.getPendingTransactions();
        const approved = this.txStateManager.getApprovedTransactions();
        return [...pending, ...approved];
      },
      approveTransaction: this.approveTransaction.bind(this),
      getCompletedTransactions:
        this.txStateManager.getConfirmedTransactions.bind(this.txStateManager),
    });

    this.txStateManager.store.subscribe(() => this.emit('update:badge'));
    this._setupListeners();
    // memstore is computed from a few different stores
    this._updateMemstore();
    this.txStateManager.store.subscribe(() => this._updateMemstore());
    this.networkStore.subscribe(() => {
      this.networkGeneration += 1;
      // Nonce locks belong to one network's provider, so use a new tracker
      // for each network.
      this.nonceTracker = this._createNonceTracker();
      this.pendingTxTracker.nonceTracker = this.nonceTracker;
      this._onBootCleanUp();
      this._updateMemstore();
    });

    // request state update to finalize initialization
    // Pending transactions are checked again on every new block, so a skipped
    // first check (block tracking stopped before a block arrived) is harmless.
    this._updatePendingTxsAfterFirstBlock().catch((error) =>
      log.warn('TransactionController - first pending check skipped', error),
    );
  }

  /**
   * Gets the current chainId in the network store as a number, returning 0 if
   * the chainId parses to NaN.
   *
   * @returns {number} The numerical chainId.
   */
  getChainId() {
    const networkState = this.getSigningChainId
      ? this.getSigningChainId()
      : this.networkStore.getState();
    // eslint-disable-next-line radix
    const integerChainId = parseInt(networkState);
    if (Number.isNaN(integerChainId)) {
      return 0;
    }
    return integerChainId;
  }

  /**
   * Adds a tx to the txlist
   *
   * @param {object} txMeta - The transaction metadata to add.
   * @fires event:"${txMeta.id}:unapproved"
   */
  addTx(txMeta) {
    this.txStateManager.addTx(txMeta);
    this.emit(`${txMeta.id}:unapproved`, txMeta);
  }

  /**
   * Add a new unapproved transaction to the pipeline
   *
   * @returns {Promise<string>} the hash of the transaction after being submitted to the network
   * @param {object} txParams - txParams for the transaction
   * @param {object} opts - with the key origin to put the origin on the txMeta
   */
  async newUnapprovedTransaction(txParams, opts = {}) {
    log.debug(
      `EcfWalletController newUnapprovedTransaction ${JSON.stringify(txParams)}`,
    );

    const initialTxMeta = await this.addUnapprovedTransaction(
      txParams,
      opts.origin,
    );

    // listen for tx completion (success, fail)
    return new Promise((resolve, reject) => {
      this.txStateManager.once(
        `${initialTxMeta.id}:finished`,
        (finishedTxMeta) => {
          switch (finishedTxMeta.status) {
            case 'submitted':
              return resolve(finishedTxMeta.hash);
            case 'rejected':
              return reject(
                cleanErrorStack(
                  providerErrors.userRejectedRequest(
                    'ecf-wallet Tx Signature: User denied transaction signature.',
                  ),
                ),
              );
            case 'failed':
              return reject(
                cleanErrorStack(rpcErrors.internal(finishedTxMeta.err.message)),
              );
            default:
              return reject(
                cleanErrorStack(
                  rpcErrors.internal(
                    `ecf-wallet Tx Signature: Unknown problem: ${JSON.stringify(finishedTxMeta.txParams)}`,
                  ),
                ),
              );
          }
        },
      );
    });
  }

  /**
   * Validates and generates a txMeta with defaults and puts it in txStateManager
   * store.
   *
   * @param {object} txParams - The transaction parameters.
   * @param {string} origin - The origin of the request.
   * @returns {Promise<object>} Resolves with the new txMeta.
   */
  async addUnapprovedTransaction(txParams, origin) {
    // validate
    const normalizedTxParams = txUtils.normalizeTxParams(txParams);

    txUtils.validateTxParams(normalizedTxParams);
    if (
      origin !== 'ecf-wallet' &&
      (normalizedTxParams.authorizationList !== undefined ||
        Number(normalizedTxParams.type) === 4)
    ) {
      throw new Error('External EIP-7702 transactions are not supported');
    }
    if (
      normalizedTxParams.chainId &&
      Number(normalizedTxParams.chainId) !== this.getChainId()
    ) {
      throw new Error(
        'Transaction chainId does not match the selected network',
      );
    }

    /**
     * `generateTxMeta` adds the default txMeta properties to the passed object.
     * These include the tx's `id`. As we use the id for determining order of
     * txes in the tx-state-manager, it is necessary to call the asynchronous
     * method `this._determineTransactionCategory` after `generateTxMeta`.
     */
    let txMeta = this.txStateManager.generateTxMeta({
      txParams: normalizedTxParams,
      signingChainId: this.getChainId(),
      type: TRANSACTION_TYPE_STANDARD,
    });

    if (origin === 'ecf-wallet') {
      // Assert the from address is the selected address
      if (normalizedTxParams.from !== this.getSelectedAddress()) {
        throw rpcErrors.internal({
          message: `Internally initiated transaction is using invalid account.`,
          data: {
            origin,
            fromAddress: normalizedTxParams.from,
            selectedAddress: this.getSelectedAddress(),
          },
        });
      }
    } else {
      // Assert that the origin has permissions to initiate transactions from
      // the specified address
      const permittedAddresses = await this.getPermittedAccounts(origin);
      if (!permittedAddresses.includes(normalizedTxParams.from)) {
        throw providerErrors.unauthorized({ data: { origin } });
      }
    }

    txMeta.origin = origin;

    const { transactionCategory, getCodeResponse } =
      await this._determineTransactionCategory(txParams);
    txMeta.transactionCategory = transactionCategory;
    txMeta.securityAlerts = await this._getSecurityAlerts(txMeta.txParams);

    // ensure value
    txMeta.txParams.value = txMeta.txParams.value
      ? ethUtil.addHexPrefix(txMeta.txParams.value)
      : '0x0';

    this.addTx(txMeta);
    this.emit('newUnapprovedTx', txMeta);

    try {
      txMeta = await this.addTxGasDefaults(txMeta, getCodeResponse);
    } catch (error) {
      log.warn(error);
      txMeta = this.txStateManager.getTx(txMeta.id);
      txMeta.loadingDefaults = false;
      this.txStateManager.updateTx(txMeta, 'Failed to calculate gas defaults.');
      throw error;
    }

    txMeta.loadingDefaults = false;
    // save txMeta
    this.txStateManager.updateTx(txMeta, 'Added new unapproved transaction.');

    return txMeta;
  }

  /**
   * Adds the default fees and gas limit to the tx params
   *
   * @param {object} txMeta - the txMeta object
   * @param {string} [getCodeResponse] - The getCode result for the recipient,
   * attached to a gas estimation error for debugging.
   * @returns {Promise<object>} resolves with txMeta
   */
  async addTxGasDefaults(txMeta, getCodeResponse) {
    const fees = await this._getDefaultFees(txMeta);
    txMeta.txParams = applyFees({ ...txMeta.txParams }, fees);
    txUtils.validateTxParams(txMeta.txParams);
    const { gasLimit: defaultGasLimit, simulationFails } =
      await this._getDefaultGasLimit(txMeta, getCodeResponse);

    // eslint-disable-next-line no-param-reassign
    txMeta = this.txStateManager.getTx(txMeta.id);
    applyFees(txMeta.txParams, fees);
    if (simulationFails) {
      txMeta.simulationFails = simulationFails;
    }
    if (defaultGasLimit && !txMeta.txParams.gas) {
      txMeta.txParams.gas = defaultGasLimit;
    }
    return txMeta;
  }

  async _getDefaultFees({ txParams: params, origin }) {
    const requestedType =
      params.type === undefined ? undefined : Number(params.type);
    // Normalization types an authorization list as 0x4, which is fee market.
    const feeMarket = isFeeMarketTransaction(params);
    // An explicit legacy envelope/price remains a supported choice. The send
    // form's suggested legacy price is replaced by caps on London networks.
    if (
      !feeMarket &&
      ([0, 1].includes(requestedType) ||
        (params.gasPrice && origin !== 'ecf-wallet'))
    ) {
      return this._getLegacyFees(
        params,
        params.accessList && requestedType === undefined,
      );
    }
    const block = await this.query.getBlockByNumber('latest', false);
    if (!block || block.baseFeePerGas === undefined) {
      if (feeMarket) {
        throw new Error(
          'The selected network does not support EIP-1559 transactions',
        );
      }
      return this._getLegacyFees(params, params.accessList);
    }
    if (requestedType === 4 && !block.requestsHash) {
      throw new Error('EIP-7702 requires a network with Prague support');
    }
    const baseFee = hexToBn(block.baseFeePerGas);
    let priority = params.maxPriorityFeePerGas;
    if (!priority) {
      priority = await this._getSuggestedPriorityFee(baseFee);

      // A dapp may supply just a cap, including a cap below the suggested tip.
      if (params.maxFeePerGas) {
        priority = bnToHex(
          BN.min(hexToBn(priority), hexToBn(params.maxFeePerGas)),
        );
      }
    }
    return {
      type: requestedType === 4 ? '0x4' : '0x2',
      maxPriorityFeePerGas: priority,
      maxFeePerGas:
        params.maxFeePerGas || bnToHex(baseFee.muln(2).add(hexToBn(priority))),
    };
  }

  /**
   * Legacy fees: the requested gas price, or the node's suggestion.
   *
   * @param {object} params - The transaction params
   * @param {boolean} accessListType - Whether to mark the envelope as type 0x1
   * @returns {Promise<object>} The fee fields
   */
  async _getLegacyFees(params, accessListType) {
    return {
      gasPrice: params.gasPrice || (await this.query.gasPrice()),
      ...(accessListType ? { type: '0x1' } : {}),
    };
  }

  /**
   * Suggests a priority fee from the node's own suggestion and the rewards paid
   * in recent blocks, taking the higher of the two. Some public RPCs answer
   * eth_maxPriorityFeePerGas with 0 even on networks where a tip is needed,
   * so that answer is not trusted on its own.
   *
   * @param {BN} baseFee - The latest block's base fee
   * @returns {Promise<string>} The suggested priority fee, as a hex quantity
   */
  async _getSuggestedPriorityFee(baseFee) {
    const toBN = (hex) => {
      txUtils.validateEnvelope({ maxPriorityFeePerGas: hex });
      return hexToBn(hex);
    };
    const suggestions = await Promise.all([
      this._sendRpc('eth_maxPriorityFeePerGas', [])
        .then(toBN)
        .catch(() => null),
      this._sendRpc('eth_feeHistory', [
        `0x${FEE_HISTORY_BLOCKS.toString(16)}`,
        'latest',
        [PRIORITY_FEE_PERCENTILE],
      ])
        .then(({ reward }) => {
          const rewards = reward
            .map(([value]) => toBN(value))
            .sort((a, b) => a.cmp(b));
          if (!rewards.length) {
            throw new Error('No fee history');
          }
          return rewards[Math.floor(rewards.length / 2)];
        })
        .catch(() => null),
    ]);
    const valid = suggestions.filter(Boolean);
    if (valid.length) {
      return bnToHex(valid.reduce((a, b) => BN.max(a, b)));
    }
    const price = await this.query.gasPrice();
    return bnToHex(BN.max(hexToBn(price).sub(baseFee), new BN(1000000000)));
  }

  _sendRpc(method, params) {
    return new Promise((resolve, reject) =>
      this.provider.sendAsync(
        { id: Date.now(), jsonrpc: '2.0', method, params },
        (error, response) =>
          error || response.error
            ? reject(error || new Error(response.error.message))
            : resolve(response.result),
      ),
    );
  }

  _createNonceTracker() {
    return new NonceTracker({
      provider: this.provider,
      blockTracker: this.blockTracker,
      getPendingTransactions: this.txStateManager.getPendingTransactions.bind(
        this.txStateManager,
      ),
      getConfirmedTransactions:
        this.txStateManager.getConfirmedTransactions.bind(this.txStateManager),
    });
  }

  /**
   * Gets default gas limit, or debug information about why gas estimate failed.
   *
   * @param {object} txMeta - The txMeta object
   * @param {string} [getCodeResponse] - The getCode result for the recipient, used for debugging purposes
   * @returns {Promise<object>} Object containing the default gas limit, or the simulation failure object
   */
  async _getDefaultGasLimit(txMeta, getCodeResponse) {
    if (txMeta.txParams.gas) {
      return {};
    } else if (
      !txMeta.txParams.accessList &&
      !txMeta.txParams.authorizationList &&
      txMeta.txParams.to &&
      txMeta.transactionCategory === SEND_ETHER_ACTION_KEY
    ) {
      // if there's data in the params, but there's no contract code, it's not a valid transaction
      if (txMeta.txParams.data) {
        const err = new Error(
          'TxGasUtil - Trying to call a function on a non-contract address',
        );
        // set error key so ui can display localized error message
        err.errorKey = TRANSACTION_NO_CONTRACT_ERROR_KEY;

        // set the response on the error so that we can see in logs what the actual response was
        err.getCodeResponse = getCodeResponse;
        throw err;
      }

      // This is a standard ether simple send, gas requirement is exactly 21k
      return { gasLimit: SIMPLE_GAS_COST };
    }

    const { blockGasLimit, estimatedGasHex, simulationFails } =
      await this.txGasUtil.analyzeGasUsage(txMeta);

    // add additional gas buffer to our estimation for safety
    const gasLimit = this.txGasUtil.addGasBuffer(
      ethUtil.addHexPrefix(estimatedGasHex),
      blockGasLimit,
    );
    return { gasLimit, simulationFails };
  }

  /**
   * Creates a new approved transaction to attempt to cancel a previously submitted transaction. The
   * new transaction contains the same nonce as the previous, is a basic ETH transfer of 0x value to
   * the sender's address, and has a higher gasPrice than that of the previous transaction.
   *
   * @param {number} originalTxId - the id of the txMeta that you want to attempt to cancel
   * @param {string} [customGasPrice] - the hex value to use for the cancel transaction
   * @returns {Promise<object>} Resolves with the cancel txMeta.
   */
  async createCancelTransaction(originalTxId, customGasPrice) {
    return this._createReplacementTransaction(
      originalTxId,
      customGasPrice,
      TRANSACTION_TYPE_CANCEL,
      (txParams) => ({
        from: txParams.from,
        to: txParams.from,
        nonce: txParams.nonce,
        gas: '0x5208',
        value: '0x0',
        ...(isFeeMarketTransaction(txParams) ? { type: '0x2' } : {}),
      }),
    );
  }

  /**
   * Creates a new approved transaction to attempt to speed up a previously submitted transaction. The
   * new transaction contains the same nonce as the previous. By default, the new transaction will use
   * the same gas limit and a 10% higher gas price, though it is possible to set a custom value for
   * each instead.
   *
   * @param {number} originalTxId - the id of the txMeta that you want to speed up
   * @param {string} [customGasPrice] - The new custom gas price, in hex
   * @param {string} [customGasLimit] - The new custom gas limt, in hex
   * @returns {Promise<object>} Resolves with the speed-up txMeta.
   */
  async createSpeedUpTransaction(originalTxId, customGasPrice, customGasLimit) {
    return this._createReplacementTransaction(
      originalTxId,
      customGasPrice,
      TRANSACTION_TYPE_RETRY,
      (txParams) => ({
        ...txParams,
        ...(customGasLimit ? { gas: customGasLimit } : {}),
      }),
    );
  }

  /**
   * Creates, approves and submits a transaction that replaces a previously
   * submitted one, reusing its nonce with higher fees.
   *
   * @private
   * @param {number} originalTxId - the id of the txMeta being replaced
   * @param {string} [customGasPrice] - the new custom gas price, in hex
   * @param {string} type - the replacement transaction type
   * @param {Function} getTxParams - builds the replacement txParams, without
   * fees, from the original txParams
   * @returns {Promise<object>} Resolves with the replacement txMeta.
   */
  async _createReplacementTransaction(
    originalTxId,
    customGasPrice,
    type,
    getTxParams,
  ) {
    const originalTxMeta = this.txStateManager.getTx(originalTxId);
    const { txParams } = originalTxMeta;

    const newTxMeta = this.txStateManager.generateTxMeta({
      txParams: {
        ...getTxParams(txParams),
        ...replacementFees(txParams, customGasPrice),
      },
      lastGasPrice: txParams.gasPrice,
      origin: originalTxMeta.origin,
      signingChainId: originalTxMeta.signingChainId,
      loadingDefaults: false,
      status: TRANSACTION_STATUS_APPROVED,
      type,
    });

    this.addTx(newTxMeta);
    await this.approveTransaction(newTxMeta.id);
    return newTxMeta;
  }

  /**
   * updates the txMeta in the txStateManager
   *
   * @param {object} txMeta - the updated txMeta
   */
  async updateTransaction(txMeta) {
    txUtils.validateTxParams(txMeta.txParams);
    const stored = this._getUnapprovedTx(txMeta.id);
    let { securityAlerts } = stored;
    if (
      stored.txParams.to !== txMeta.txParams.to ||
      stored.txParams.data !== txMeta.txParams.data
    ) {
      securityAlerts = await this._getSecurityAlerts(txMeta.txParams);
    }
    // The checks are async, so the transaction may have been approved since.
    this.txStateManager.updateTx(
      { ...this._editedTxMeta(txMeta), securityAlerts },
      'confTx: user updated transaction',
    );
  }

  /**
   * updates and approves the transaction
   *
   * @param {object} txMeta - The transaction metadata, as edited by the user.
   */
  async updateAndApproveTransaction(txMeta) {
    txUtils.validateTxParams(txMeta.txParams);
    this._assertSameCounterparties(this._getUnapprovedTx(txMeta.id), txMeta);
    // Nothing is awaited between the status check and approveTransaction
    // setting the status to approved, so a second approval fails the check.
    this.txStateManager.updateTx(
      this._editedTxMeta(txMeta),
      'confTx: user approved transaction',
    );
    await this.approveTransaction(txMeta.id);
  }

  /**
   * Returns a stored transaction that is still awaiting the user's approval.
   *
   * @private
   * @param {number} txId - The transaction's id.
   * @returns {object} The stored transaction metadata.
   * @throws If the transaction is unknown or no longer unapproved.
   */
  _getUnapprovedTx(txId) {
    const stored = this.txStateManager.getTx(txId);
    if (!stored || stored.status !== TRANSACTION_STATUS_UNAPPROVED) {
      throw new Error(`Transaction ${txId} is not awaiting approval`);
    }
    return stored;
  }

  /**
   * Applies the user's edits to a stored unapproved transaction. A UI copy
   * may be stale, so the fields the wallet owns come from the stored copy.
   *
   * @private
   * @param {object} txMeta - The transaction metadata, as edited by the user.
   * @returns {object} The transaction metadata to store.
   */
  _editedTxMeta(txMeta) {
    const stored = this._getUnapprovedTx(txMeta.id);
    return {
      ...txMeta,
      status: stored.status,
      origin: stored.origin,
      signingChainId: stored.signingChainId,
      securityAlerts: stored.securityAlerts,
      history: stored.history,
    };
  }

  /**
   * sets the tx status to approved
   * auto fills the nonce
   * signs the transaction
   * publishes the transaction
   * if any of these steps fails the tx status will be set to failed
   *
   * @param {number} txId - the tx's Id
   */
  async approveTransaction(txId) {
    // Approval is async, so track what is currently being signed so that a
    // repeated approval does not increment the nonce and resubmit a
    // transaction that is already being incremented and signed.
    if (this.inProcessOfSigning.has(txId)) {
      return;
    }
    this.inProcessOfSigning.add(txId);
    try {
      await this._approveTransaction(txId);
    } finally {
      this.inProcessOfSigning.delete(txId);
    }
  }

  /**
   * Approves, signs and publishes a transaction; see `approveTransaction`.
   * Callers must ensure the transaction is not already being approved.
   *
   * @private
   * @param {number} txId - the tx's Id
   */
  async _approveTransaction(txId) {
    const { networkGeneration } = this;
    let nonceLock;
    try {
      // approve
      this.txStateManager.setTxStatusApproved(txId);
      // get next nonce
      const txMeta = this.txStateManager.getTx(txId);
      const fromAddress = txMeta.txParams.from;
      // wait for a nonce
      nonceLock = await this.nonceTracker.getNonceLock(fromAddress);
      this.assertNetworkGeneration(networkGeneration);
      // add nonce to txParams
      // Preserve explicit and replacement nonces; otherwise allocate the next nonce.
      const nonce =
        txMeta.txParams.nonce === undefined
          ? nonceLock.nextNonce
          : txMeta.txParams.nonce;

      txMeta.txParams.nonce = ethUtil.addHexPrefix(nonce.toString(16));
      // add nonce debugging information to txMeta
      txMeta.nonceDetails = nonceLock.nonceDetails;
      this.txStateManager.updateTx(txMeta, 'transactions#approveTransaction');
      // sign transaction
      const rawTx = await this.signTransaction(txId);
      await this.publishTransaction(txId, rawTx, networkGeneration);
      // must set transaction to submitted/failed before releasing lock
      nonceLock.releaseLock();
    } catch (err) {
      // this is try-catch wrapped so that we can guarantee that the nonceLock is released
      try {
        this.txStateManager.setTxStatusFailed(txId, err);
      } catch (err2) {
        log.error(err2);
      }
      // must set transaction to submitted/failed before releasing lock
      if (nonceLock) {
        nonceLock.releaseLock();
      }
      // continue with error chain
      throw err;
    }
  }

  /**
   * adds the chain id and signs the transaction and set the status to signed
   *
   * @param {number} txId - the tx's Id
   * @returns {Promise<string>} rawTx
   */
  async signTransaction(txId) {
    const { networkGeneration } = this;
    const txMeta = this.txStateManager.getTx(txId);
    // add network/chain id
    const chainId = this.getChainId();
    const txParams = { ...txMeta.txParams, chainId };
    // sign tx
    const fromAddress = txParams.from;
    txUtils.validateTxParams(txMeta.txParams);
    if (
      !Number.isSafeInteger(chainId) ||
      chainId <= 0 ||
      (txMeta.signingChainId !== undefined &&
        txMeta.signingChainId !== chainId) ||
      (txMeta.txParams.chainId && Number(txMeta.txParams.chainId) !== chainId)
    ) {
      throw new Error('Invalid transaction chainId for the selected network');
    }
    if (Number(txParams.type) === 4 && txMeta.origin !== 'ecf-wallet') {
      throw new Error('External EIP-7702 transactions are not supported');
    }
    if (Number(txParams.type)) {
      txMeta.txParams.chainId = `0x${chainId.toString(16)}`;
    }
    const unsignedTx = createTransaction(txParams, chainId);
    const expectedMessage = Buffer.from(unsignedTx.getHashedMessageToSign());
    const ethTx = await this.signEthTx(unsignedTx, fromAddress);
    this.assertNetworkGeneration(networkGeneration);
    if (this.getChainId() !== chainId) {
      throw new Error(
        'Network changed while signing. Please submit the transaction again.',
      );
    }
    // Signed transactions are new objects, so check that the signer kept the
    // approved fields, type and chain (the hash covers both) and account.
    if (
      !ethTx ||
      ethTx.type !== unsignedTx.type ||
      !expectedMessage.equals(Buffer.from(ethTx.getHashedMessageToSign())) ||
      ethTx.getSenderAddress().toString().toLowerCase() !==
        fromAddress.toLowerCase()
    ) {
      throw new Error(
        'The signed transaction does not match the approved transaction or account',
      );
    }
    if (!ethTx.verifySignature()) {
      throw new Error('The signer returned an invalid transaction signature');
    }

    // add r,s,v values for provider request purposes see createEcfWalletMiddleware
    // and JSON rpc standard for further explanation
    const signatureHex = (value) =>
      typeof value === 'bigint'
        ? `0x${value.toString(16)}`
        : ethUtil.bytesToHex(value);
    txMeta.r = signatureHex(ethTx.r);
    txMeta.s = signatureHex(ethTx.s);
    txMeta.v = signatureHex(ethTx.v);

    this.txStateManager.updateTx(
      txMeta,
      'transactions#signTransaction: add r, s, v values',
    );

    // set state to signed
    this.txStateManager.setTxStatusSigned(txMeta.id);
    const rawTx = ethUtil.bytesToHex(Buffer.from(ethTx.serialize()));
    return rawTx;
  }

  assertNetworkGeneration(generation) {
    if (generation !== this.networkGeneration) {
      throw new Error(
        'Network changed while signing. Please submit the transaction again.',
      );
    }
  }

  /**
   * publishes the raw tx and sets the txMeta to submitted
   *
   * @param {number} txId - the tx's Id
   * @param {string} rawTx - the hex string of the serialized signed transaction
   * @param {number} networkGeneration - the network generation when approval began
   * @returns {Promise<void>}
   */
  async publishTransaction(
    txId,
    rawTx,
    networkGeneration = this.networkGeneration,
  ) {
    this.assertNetworkGeneration(networkGeneration);
    const txMeta = this.txStateManager.getTx(txId);
    const chainId = txMeta?.signingChainId ?? txMeta?.txParams?.chainId;
    if (
      !txMeta ||
      (chainId !== undefined && Number(chainId) !== this.getChainId())
    ) {
      throw new Error(
        'Network changed before publishing. Please submit the transaction again.',
      );
    }
    txMeta.rawTx = rawTx;
    this.txStateManager.updateTx(txMeta, 'transactions#publishTransaction');
    let txHash;
    try {
      txHash = await this.query.sendRawTransaction(rawTx);
    } catch (error) {
      if (error.message.toLowerCase().includes('known transaction')) {
        txHash = ethUtil.bytesToHex(
          keccak256(ethUtil.toBytes(ethUtil.addHexPrefix(rawTx))),
        );
      } else {
        throw error;
      }
    }
    this.setTxHash(txId, txHash);

    this.txStateManager.setTxStatusSubmitted(txId);
  }

  /**
   * Stores the receipt, sets the status of the transaction to confirmed and sets the status of
   * nonce duplicates as dropped
   *
   * @param {number} txId - The tx's ID
   * @param {object} txReceipt - The transaction receipt.
   * @returns {Promise<void>}
   */
  async confirmTransaction(txId, txReceipt) {
    const txMeta = this.txStateManager.getTx(txId);

    if (!txMeta) {
      return;
    }

    try {
      // store the receipt before marking the transaction confirmed, so the
      // ui has it when it receives the update
      txMeta.txReceipt = { ...txReceipt };

      this.txStateManager.updateTx(
        txMeta,
        'transactions#confirmTransaction - add txReceipt',
      );
    } catch (err) {
      log.error(err);
    }

    this.txStateManager.setTxStatusConfirmed(txId);
    this._markNonceDuplicatesDropped(txId);
  }

  /**
   * Convenience method for the ui thats sets the transaction to rejected
   *
   * @param {number} txId - the tx's Id
   * @returns {Promise<void>}
   */
  async cancelTransaction(txId) {
    this.txStateManager.setTxStatusRejected(txId);
  }

  /**
   * Sets the txHas on the txMeta
   *
   * @param {number} txId - the tx's Id
   * @param {string} txHash - the hash for the txMeta
   */
  setTxHash(txId, txHash) {
    // Add the tx hash to the persisted meta-tx object
    const txMeta = this.txStateManager.getTx(txId);
    txMeta.hash = txHash;
    this.txStateManager.updateTx(txMeta, 'transactions#setTxHash');
  }

  //
  //           PRIVATE METHODS
  //
  /** maps methods for convenience*/
  _mapMethods() {
    /**
     * Gets the memory store state.
     *
     * @returns {object} the state in transaction controller
     */
    this.getState = () => this.memStore.getState();

    /**
     * Gets the current network.
     *
     * @returns {string|number} the network number stored in networkStore
     */
    this.getNetwork = () => this.networkStore.getState();

    /**
     * Gets the selected address.
     *
     * @returns {string} the user selected address
     */
    this.getSelectedAddress = () =>
      this.preferencesStore.getState().selectedAddress;

    /**
     * Counts the unapproved transactions.
     *
     * @returns {number} the number of transactions whose status is unapproved
     */
    this.getUnapprovedTxCount = () =>
      Object.keys(this.txStateManager.getUnapprovedTxList()).length;

    /**
     * see txStateManager
     *
     * @param {object} opts - The filter options, passed to txStateManager.
     * @returns {Array<object>} The matching txMetas.
     */
    this.getFilteredTxList = (opts) =>
      this.txStateManager.getFilteredTxList(opts);
  }

  // called once on startup
  async _updatePendingTxsAfterFirstBlock() {
    // wait for first block so we know we're ready
    await this.blockTracker.getLatestBlock();
    // get status update for all pending transactions (for the current network)
    await this.pendingTxTracker.updatePendingTxs();
  }

  /**
   * If transaction controller was rebooted with transactions that are uncompleted
   * in steps of the transaction signing or user confirmation process it will either
   * transition txMetas to a failed state or try to redo those tasks.
   */

  _onBootCleanUp() {
    this.txStateManager
      .getFilteredTxList({
        status: 'unapproved',
        loadingDefaults: true,
      })
      .forEach((tx) => {
        this.addTxGasDefaults(tx)
          .then((txMeta) => {
            txMeta.loadingDefaults = false;
            this.txStateManager.updateTx(
              txMeta,
              'transactions: gas estimation for tx on boot',
            );
            return undefined;
          })
          .catch((error) => {
            const txMeta = this.txStateManager.getTx(tx.id);
            txMeta.loadingDefaults = false;
            this.txStateManager.updateTx(
              txMeta,
              'failed to estimate gas during boot cleanup.',
            );
            this.txStateManager.setTxStatusFailed(txMeta.id, error);
          });
      });

    this.txStateManager
      .getFilteredTxList({
        status: TRANSACTION_STATUS_APPROVED,
      })
      .forEach((txMeta) => {
        const txSignError = new Error(
          'Transaction found as "approved" during boot - possibly stuck during signing',
        );
        this.txStateManager.setTxStatusFailed(txMeta.id, txSignError);
      });
  }

  /**
   * is called in constructor applies the listeners for pendingTxTracker txStateManager
   * and blockTracker
   */
  _setupListeners() {
    this.txStateManager.on(
      'tx:status-update',
      this.emit.bind(this, 'tx:status-update'),
    );
    this._setupBlockTrackerListener();
    this.pendingTxTracker.on('tx:warning', (txMeta) => {
      this.txStateManager.updateTx(
        txMeta,
        'transactions/pending-tx-tracker#event: tx:warning',
      );
    });
    this.pendingTxTracker.on(
      'tx:failed',
      this.txStateManager.setTxStatusFailed.bind(this.txStateManager),
    );
    this.pendingTxTracker.on('tx:confirmed', (txId, transactionReceipt) =>
      this.confirmTransaction(txId, transactionReceipt),
    );
    this.pendingTxTracker.on(
      'tx:dropped',
      this.txStateManager.setTxStatusDropped.bind(this.txStateManager),
    );
    this.pendingTxTracker.on('tx:block-update', (txMeta, latestBlockNumber) => {
      if (!txMeta.firstRetryBlockNumber) {
        txMeta.firstRetryBlockNumber = latestBlockNumber;
        this.txStateManager.updateTx(
          txMeta,
          'transactions/pending-tx-tracker#event: tx:block-update',
        );
      }
    });
    this.pendingTxTracker.on('tx:retry', (txMeta) => {
      if (!Object.prototype.hasOwnProperty.call(txMeta, 'retryCount')) {
        txMeta.retryCount = 0;
      }
      txMeta.retryCount += 1;
      this.txStateManager.updateTx(
        txMeta,
        'transactions/pending-tx-tracker#event: tx:retry',
      );
    });
  }

  /**
   * The confirmation's alerts describe who receives funds or permissions. A
   * change to those at approval time would skip that review, so it is refused.
   * Amounts may change, for example with a custom spending limit.
   *
   * @param {object} [stored] - The stored txMeta.
   * @param {object} updated - The txMeta as approved by the user.
   */
  _assertSameCounterparties(stored, updated) {
    if (!stored) {
      return;
    }
    const parties = ({ txParams: { to, data } }) => {
      const call = decodeCall(data);
      return [to, call?.recipient, call?.spender].map((address) =>
        address?.toLowerCase(),
      );
    };
    if (
      parties(stored).some(
        (address, index) => address !== parties(updated)[index],
      )
    ) {
      throw new Error(
        'The transaction recipient changed after it was reviewed. Review it again.',
      );
    }
  }

  /**
   * Runs the on-device checks for a new transaction. A failing check must not
   * block the transaction, so errors yield an alert that the checks failed.
   *
   * @param {object} txParams - The transaction.
   * @returns {Promise<object[]>} Alerts to show with the confirmation.
   */
  async _getSecurityAlerts(txParams) {
    if (!this.getSecurityContext) {
      return [];
    }
    try {
      const { ownAccounts, contacts, tokenContracts } =
        this.getSecurityContext();
      const knownAddresses = new Set(contacts);
      for (const {
        txParams: previous,
        status,
      } of this.txStateManager.getTxList()) {
        if (['submitted', 'confirmed'].includes(status) && previous.to) {
          const recipient = decodeCall(previous.data)?.recipient || previous.to;
          knownAddresses.add(recipient.toLowerCase());
        }
      }
      return await getTransactionAlerts({
        txParams,
        getCode: (address) => this.query.getCode(address),
        ownAccounts,
        knownAddresses,
        tokenContracts,
      });
    } catch (error) {
      log.warn('Transaction checks failed', error);
      return [checksFailedAlert()];
    }
  }

  /**
   * Returns a category for a transaction out of the following list: sentEther, transfer, approve,
   * transferfrom, contractDeployment, contractInteraction
   *
   * @param {object} txParams - The transaction parameters.
   * @returns {Promise<{ transactionCategory: string, getCodeResponse: string | null | undefined }>}
   * The category, and the getCode result for the recipient when it was fetched.
   */
  async _determineTransactionCategory(txParams) {
    const { data, to } = txParams;
    const { name } = (data && decodeTokenMethod(data)) || {};
    const tokenMethodName = [
      TOKEN_METHOD_APPROVE,
      TOKEN_METHOD_TRANSFER,
      TOKEN_METHOD_TRANSFER_FROM,
    ].find((methodName) => methodName === name && name.toLowerCase());

    let result;
    if (txParams.data && tokenMethodName) {
      result = tokenMethodName;
    } else if (txParams.data && !to) {
      result = DEPLOY_CONTRACT_ACTION_KEY;
    }

    let code;
    if (!result) {
      try {
        code = await this.query.getCode(to);
      } catch (e) {
        code = null;
        log.warn(e);
      }

      const codeIsEmpty = !code || code === '0x' || code === '0x0';

      result = codeIsEmpty ? SEND_ETHER_ACTION_KEY : CONTRACT_INTERACTION_KEY;
    }

    return { transactionCategory: result, getCodeResponse: code };
  }

  /**
   * Sets other txMeta statuses to dropped if the txMeta that has been confirmed has other transactions
   * in the list have the same nonce
   *
   * @param {number} txId - the txId of the transaction that has been confirmed in a block
   */
  _markNonceDuplicatesDropped(txId) {
    // get the confirmed transactions nonce and from address
    const txMeta = this.txStateManager.getTx(txId);
    const { nonce, from } = txMeta.txParams;
    const sameNonceTxs = this.txStateManager.getFilteredTxList({ nonce, from });
    // mark all same nonce transactions as dropped and give them a replacedBy hash
    sameNonceTxs.forEach((otherTxMeta) => {
      if (otherTxMeta.id === txId) {
        return;
      }
      otherTxMeta.replacedBy = txMeta.hash;
      this.txStateManager.updateTx(
        otherTxMeta,
        'transactions/pending-tx-tracker#event: tx:confirmed reference to confirmed txHash with same nonce',
      );
      this.txStateManager.setTxStatusDropped(otherTxMeta.id);
    });
  }

  _setupBlockTrackerListener() {
    let listenersAreActive = false;
    const latestBlockHandler = this._onLatestBlock.bind(this);
    const { blockTracker, txStateManager } = this;

    txStateManager.on('tx:status-update', updateSubscription);
    updateSubscription();

    function updateSubscription() {
      const pendingTxs = txStateManager.getPendingTransactions();
      if (!listenersAreActive && pendingTxs.length > 0) {
        blockTracker.on('latest', latestBlockHandler);
        listenersAreActive = true;
      } else if (listenersAreActive && !pendingTxs.length) {
        blockTracker.removeListener('latest', latestBlockHandler);
        listenersAreActive = false;
      }
    }
  }

  async _onLatestBlock(blockNumber) {
    try {
      await this.pendingTxTracker.updatePendingTxs();
    } catch (err) {
      log.error(err);
    }
    try {
      await this.pendingTxTracker.resubmitPendingTxs(blockNumber);
    } catch (err) {
      log.error(err);
    }
  }

  /**
   * Updates the memStore in transaction controller
   */
  _updateMemstore() {
    const unapprovedTxs = this.txStateManager.getUnapprovedTxList();
    const currentNetworkTxList = this.txStateManager.getTxList(
      MAX_MEMSTORE_TX_LIST_SIZE,
    );
    this.memStore.updateState({ unapprovedTxs, currentNetworkTxList });
  }
}
