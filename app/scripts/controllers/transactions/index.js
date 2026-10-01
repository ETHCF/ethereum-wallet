import EventEmitter from 'safe-event-emitter'
import ObservableStore from 'obs-store'
import ethUtil from 'ethereumjs-util'
import BN from 'bn.js'
import EthQuery from 'ethjs-query'
import { ethErrors } from 'eth-json-rpc-errors'
import abi from 'human-standard-token-abi'
import abiDecoder from 'abi-decoder'
import NonceTracker from 'nonce-tracker'
import log from 'loglevel'
import { isFeeMarketTransaction, replacementFees } from '../../lib/transaction-fees'
import { createTransaction } from '../../lib/transaction-codec'
import {
  TOKEN_METHOD_APPROVE,
  TOKEN_METHOD_TRANSFER,
  TOKEN_METHOD_TRANSFER_FROM,
  SEND_ETHER_ACTION_KEY,
  DEPLOY_CONTRACT_ACTION_KEY,
  CONTRACT_INTERACTION_KEY,
} from '../../../../ui/app/helpers/constants/transactions'
import cleanErrorStack from '../../lib/cleanErrorStack'
import { TRANSACTION_NO_CONTRACT_ERROR_KEY } from '../../../../ui/app/helpers/constants/error-keys'
import TransactionStateManager from './tx-state-manager'
import TxGasUtil from './tx-gas-utils'
import PendingTransactionTracker from './pending-tx-tracker'
import * as txUtils from './lib/util'
import {
  TRANSACTION_TYPE_CANCEL,
  TRANSACTION_TYPE_RETRY,
  TRANSACTION_TYPE_STANDARD,
  TRANSACTION_STATUS_APPROVED,
} from './enums'

abiDecoder.addABI(abi)

const SIMPLE_GAS_COST = '0x5208' // Hex for 21000, cost of a simple send.
const MAX_MEMSTORE_TX_LIST_SIZE = 100 // Number of transactions (by unique nonces) to keep in memory

/**
  Transaction Controller is an aggregate of sub-controllers and trackers
  composing them in a way to be exposed to the ecf-wallet controller
    <br>- txStateManager
      responsible for the state of a transaction and
      storing the transaction
    <br>- pendingTxTracker
      watching blocks for transactions to be include
      and emitting confirmed events
    <br>- txGasUtil
      gas calculations and safety buffering
    <br>- nonceTracker
      calculating nonces

  @class
  @param {Object} - opts
  @param {Object}  opts.initState - initial transaction list default is an empty array
  @param {Object}  opts.networkStore - an observable store for network number
  @param {Object}  opts.blockTracker - An instance of eth-blocktracker
  @param {Object}  opts.provider - A network provider.
  @param {Function}  opts.signTransaction - function the signs an ethereumjs-tx
  @param {Object}  opts.getPermittedAccounts - get accounts that an origin has permissions for
  @param {Function}  opts.signTransaction - ethTx signer that returns a rawTx
  @param {number}  [opts.txHistoryLimit] - number *optional* for limiting how many transactions are in state
  @param {Object}  opts.preferencesStore
*/

export default class TransactionController extends EventEmitter {
  constructor (opts) {
    super()
    this.networkStore = opts.networkStore || new ObservableStore({})
    this.preferencesStore = opts.preferencesStore || new ObservableStore({})
    this.provider = opts.provider
    this.getSigningChainId = opts.getChainId
    this.getPermittedAccounts = opts.getPermittedAccounts
    this.blockTracker = opts.blockTracker
    this.signEthTx = opts.signTransaction
    this.inProcessOfSigning = new Set()
    this.networkGeneration = 0

    this.memStore = new ObservableStore({})
    this.query = new EthQuery(this.provider)
    this.txGasUtil = new TxGasUtil(this.provider)

    this._mapMethods()
    this.txStateManager = new TransactionStateManager({
      initState: opts.initState,
      txHistoryLimit: opts.txHistoryLimit,
      getNetwork: this.getNetwork.bind(this),
    })
    this._onBootCleanUp()

    this.store = this.txStateManager.store
    this.nonceTracker = new NonceTracker({
      provider: this.provider,
      blockTracker: this.blockTracker,
      getPendingTransactions: this.txStateManager.getPendingTransactions.bind(this.txStateManager),
      getConfirmedTransactions: this.txStateManager.getConfirmedTransactions.bind(this.txStateManager),
    })

    this.pendingTxTracker = new PendingTransactionTracker({
      provider: this.provider,
      nonceTracker: this.nonceTracker,
      publishTransaction: (rawTx) => this.query.sendRawTransaction(rawTx),
      getPendingTransactions: () => {
        const pending = this.txStateManager.getPendingTransactions()
        const approved = this.txStateManager.getApprovedTransactions()
        return [...pending, ...approved]
      },
      approveTransaction: this.approveTransaction.bind(this),
      getCompletedTransactions: this.txStateManager.getConfirmedTransactions.bind(this.txStateManager),
    })

    this.txStateManager.store.subscribe(() => this.emit('update:badge'))
    this._setupListeners()
    // memstore is computed from a few different stores
    this._updateMemstore()
    this.txStateManager.store.subscribe(() => this._updateMemstore())
    this.networkStore.subscribe(() => {
      this.networkGeneration += 1
      this._onBootCleanUp()
      this._updateMemstore()
    })

    // request state update to finalize initialization
    this._updatePendingTxsAfterFirstBlock()
  }

  /**
   * Gets the current chainId in the network store as a number, returning 0 if
   * the chainId parses to NaN.
   *
   * @returns {number} The numerical chainId.
   */
  getChainId () {
    const networkState = this.getSigningChainId ? this.getSigningChainId() : this.networkStore.getState()
    // eslint-disable-next-line radix
    const integerChainId = parseInt(networkState)
    if (Number.isNaN(integerChainId)) {
      return 0
    }
    return integerChainId
  }

  /**
  Adds a tx to the txlist
  @emits ${txMeta.id}:unapproved
  */
  addTx (txMeta) {
    this.txStateManager.addTx(txMeta)
    this.emit(`${txMeta.id}:unapproved`, txMeta)
  }

  /**
  Wipes the transactions for a given account
  @param {string} address - hex string of the from address for txs being removed
  */
  wipeTransactions (address) {
    this.txStateManager.wipeTransactions(address)
  }

  /**
  * Add a new unapproved transaction to the pipeline
  *
  * @returns {Promise<string>} - the hash of the transaction after being submitted to the network
  * @param {Object} txParams - txParams for the transaction
  * @param {Object} opts - with the key origin to put the origin on the txMeta
  */
  async newUnapprovedTransaction (txParams, opts = {}) {

    log.debug(`EcfWalletController newUnapprovedTransaction ${JSON.stringify(txParams)}`)

    const initialTxMeta = await this.addUnapprovedTransaction(txParams, opts.origin)

    // listen for tx completion (success, fail)
    return new Promise((resolve, reject) => {
      this.txStateManager.once(`${initialTxMeta.id}:finished`, (finishedTxMeta) => {
        switch (finishedTxMeta.status) {
          case 'submitted':
            return resolve(finishedTxMeta.hash)
          case 'rejected':
            return reject(cleanErrorStack(ethErrors.provider.userRejectedRequest('ecf-wallet Tx Signature: User denied transaction signature.')))
          case 'failed':
            return reject(cleanErrorStack(ethErrors.rpc.internal(finishedTxMeta.err.message)))
          default:
            return reject(cleanErrorStack(ethErrors.rpc.internal(`ecf-wallet Tx Signature: Unknown problem: ${JSON.stringify(finishedTxMeta.txParams)}`)))
        }
      })
    })
  }

  /**
   * Validates and generates a txMeta with defaults and puts it in txStateManager
   * store.
   *
   * @returns {txMeta}
   */
  async addUnapprovedTransaction (txParams, origin) {

    // validate
    const normalizedTxParams = txUtils.normalizeTxParams(txParams)

    txUtils.validateTxParams(normalizedTxParams)
    if (origin !== 'ecf-wallet' && (normalizedTxParams.authorizationList !== undefined || Number(normalizedTxParams.type) === 4)) {
      throw new Error('External EIP-7702 transactions are not supported')
    }
    if (normalizedTxParams.chainId && Number(normalizedTxParams.chainId) !== this.getChainId()) {
      throw new Error('Transaction chainId does not match the selected network')
    }

    /**
    `generateTxMeta` adds the default txMeta properties to the passed object.
    These include the tx's `id`. As we use the id for determining order of
    txes in the tx-state-manager, it is necessary to call the asynchronous
    method `this._determineTransactionCategory` after `generateTxMeta`.
    */
    let txMeta = this.txStateManager.generateTxMeta({
      txParams: normalizedTxParams,
      signingChainId: this.getChainId(),
      type: TRANSACTION_TYPE_STANDARD,
    })

    if (origin === 'ecf-wallet') {
      // Assert the from address is the selected address
      if (normalizedTxParams.from !== this.getSelectedAddress()) {
        throw ethErrors.rpc.internal({
          message: `Internally initiated transaction is using invalid account.`,
          data: {
            origin,
            fromAddress: normalizedTxParams.from,
            selectedAddress: this.getSelectedAddress(),
          },
        })
      }
    } else {
      // Assert that the origin has permissions to initiate transactions from
      // the specified address
      const permittedAddresses = await this.getPermittedAccounts(origin)
      if (!permittedAddresses.includes(normalizedTxParams.from)) {
        throw ethErrors.provider.unauthorized({ data: { origin } })
      }
    }

    txMeta.origin = origin

    const { transactionCategory, getCodeResponse } = await this._determineTransactionCategory(txParams)
    txMeta.transactionCategory = transactionCategory

    // ensure value
    txMeta.txParams.value = txMeta.txParams.value
      ? ethUtil.addHexPrefix(txMeta.txParams.value)
      : '0x0'

    this.addTx(txMeta)
    this.emit('newUnapprovedTx', txMeta)

    try {
      txMeta = await this.addTxGasDefaults(txMeta, getCodeResponse)
    } catch (error) {
      log.warn(error)
      txMeta = this.txStateManager.getTx(txMeta.id)
      txMeta.loadingDefaults = false
      this.txStateManager.updateTx(txMeta, 'Failed to calculate gas defaults.')
      throw error
    }

    txMeta.loadingDefaults = false
    // save txMeta
    this.txStateManager.updateTx(txMeta, 'Added new unapproved transaction.')

    return txMeta
  }

  /**
   * Adds the tx gas defaults: gas && gasPrice
   * @param {Object} txMeta - the txMeta object
   * @returns {Promise<object>} - resolves with txMeta
   */
  async addTxGasDefaults (txMeta, getCodeResponse) {
    const fees = await this._getDefaultFees(txMeta)
    txMeta.txParams = { ...txMeta.txParams, ...fees }
    if (isFeeMarketTransaction(txMeta.txParams)) {
      delete txMeta.txParams.gasPrice
    }
    txUtils.validateTxParams(txMeta.txParams)
    const { gasLimit: defaultGasLimit, simulationFails } = await this._getDefaultGasLimit(txMeta, getCodeResponse)

    // eslint-disable-next-line no-param-reassign
    txMeta = this.txStateManager.getTx(txMeta.id)
    Object.assign(txMeta.txParams, fees)
    if (isFeeMarketTransaction(txMeta.txParams)) {
      delete txMeta.txParams.gasPrice
    }
    if (simulationFails) {
      txMeta.simulationFails = simulationFails
    }
    if (defaultGasLimit && !txMeta.txParams.gas) {
      txMeta.txParams.gas = defaultGasLimit
    }
    return txMeta
  }

  async _getDefaultFees ({ txParams: params, origin }) {
    const requestedType = params.type === undefined ? undefined : Number(params.type)
    const feeMarket = isFeeMarketTransaction(params) || params.authorizationList !== undefined
    // An explicit legacy envelope/price remains a supported choice. The send
    // form's suggested legacy price is replaced by caps on London networks.
    if (!feeMarket && ([0, 1].includes(requestedType) || (params.gasPrice && origin !== 'ecf-wallet'))) {
      return {
        gasPrice: params.gasPrice || await this._getDefaultGasPrice({ txParams: params }),
        ...(params.accessList && requestedType === undefined ? { type: '0x1' } : {}),
      }
    }
    const block = await this.query.getBlockByNumber('latest', false)
    if (!block || block.baseFeePerGas === undefined) {
      if (feeMarket) {
        throw new Error('The selected network does not support EIP-1559 transactions')
      }
      return {
        gasPrice: params.gasPrice || await this._getDefaultGasPrice({ txParams: params }),
        ...(params.accessList ? { type: '0x1' } : {}),
      }
    }
    if ((requestedType === 4 || params.authorizationList) && !block.requestsHash) {
      throw new Error('EIP-7702 requires a network with Prague support')
    }
    const baseFee = new BN(block.baseFeePerGas.replace(/^0x/u, ''), 16)
    let priority = params.maxPriorityFeePerGas
    if (!priority) {
      try {
        priority = await new Promise((resolve, reject) => this.provider.sendAsync({
          id: Date.now(), jsonrpc: '2.0', method: 'eth_maxPriorityFeePerGas', params: [],
        }, (error, response) => (error || response.error ? reject(error || new Error(response.error.message)) : resolve(response.result))))
        txUtils.validateEnvelope({ maxPriorityFeePerGas: priority })
        if (!priority) {
          throw new Error('No priority fee estimate')
        }
      } catch (_) {
        const price = await this.query.gasPrice()
        priority = `0x${BN.max(new BN(price.toString(16), 16).sub(baseFee), new BN(1000000000)).toString(16)}`
      }
      // A dapp may supply just a cap, including a cap below the suggested tip.
      if (params.maxFeePerGas) {
        priority = `0x${BN.min(new BN(priority.slice(2), 16), new BN(params.maxFeePerGas.slice(2), 16)).toString(16)}`
      }
    }
    return {
      type: requestedType === 4 || params.authorizationList ? '0x4' : '0x2',
      maxPriorityFeePerGas: priority,
      maxFeePerGas: params.maxFeePerGas || `0x${baseFee.muln(2).add(new BN(priority.slice(2), 16)).toString(16)}`,
    }
  }

  /**
   * Gets default gas price, or returns `undefined` if gas price is already set
   * @param {Object} txMeta - The txMeta object
   * @returns {Promise<string|undefined>} The default gas price
   */
  async _getDefaultGasPrice (txMeta) {
    if (txMeta.txParams.gasPrice) {
      return undefined
    }
    const gasPrice = await this.query.gasPrice()

    return ethUtil.addHexPrefix(gasPrice.toString(16))
  }

  /**
   * Gets default gas limit, or debug information about why gas estimate failed.
   * @param {Object} txMeta - The txMeta object
   * @param {string} getCodeResponse - The transaction category code response, used for debugging purposes
   * @returns {Promise<Object>} Object containing the default gas limit, or the simulation failure object
   */
  async _getDefaultGasLimit (txMeta, getCodeResponse) {
    if (txMeta.txParams.gas) {
      return {}
    } else if (
      !txMeta.txParams.accessList &&
      !txMeta.txParams.authorizationList &&
      txMeta.txParams.to &&
      txMeta.transactionCategory === SEND_ETHER_ACTION_KEY
    ) {
      // if there's data in the params, but there's no contract code, it's not a valid transaction
      if (txMeta.txParams.data) {
        const err = new Error('TxGasUtil - Trying to call a function on a non-contract address')
        // set error key so ui can display localized error message
        err.errorKey = TRANSACTION_NO_CONTRACT_ERROR_KEY

        // set the response on the error so that we can see in logs what the actual response was
        err.getCodeResponse = getCodeResponse
        throw err
      }

      // This is a standard ether simple send, gas requirement is exactly 21k
      return { gasLimit: SIMPLE_GAS_COST }
    }

    const { blockGasLimit, estimatedGasHex, simulationFails } = await this.txGasUtil.analyzeGasUsage(txMeta)

    // add additional gas buffer to our estimation for safety
    const gasLimit = this.txGasUtil.addGasBuffer(ethUtil.addHexPrefix(estimatedGasHex), blockGasLimit)
    return { gasLimit, simulationFails }
  }

  /**
   * Creates a new approved transaction to attempt to cancel a previously submitted transaction. The
   * new transaction contains the same nonce as the previous, is a basic ETH transfer of 0x value to
   * the sender's address, and has a higher gasPrice than that of the previous transaction.
   * @param {number} originalTxId - the id of the txMeta that you want to attempt to cancel
   * @param {string} [customGasPrice] - the hex value to use for the cancel transaction
   * @returns {txMeta}
   */
  async createCancelTransaction (originalTxId, customGasPrice) {
    const originalTxMeta = this.txStateManager.getTx(originalTxId)
    const { txParams } = originalTxMeta
    const { gasPrice: lastGasPrice, from, nonce } = txParams

    const fees = replacementFees(txParams, customGasPrice)
    const newTxMeta = this.txStateManager.generateTxMeta({
      txParams: {
        from,
        to: from,
        nonce,
        gas: '0x5208',
        value: '0x0',
        ...(isFeeMarketTransaction(txParams) ? { type: '0x2' } : {}),
        ...fees,
      },
      lastGasPrice,
      origin: originalTxMeta.origin,
      signingChainId: originalTxMeta.signingChainId,
      ...(txParams.maxFeePerGas ? { lastMaxFeePerGas: txParams.maxFeePerGas } : {}),
      loadingDefaults: false,
      status: TRANSACTION_STATUS_APPROVED,
      type: TRANSACTION_TYPE_CANCEL,
    })

    this.addTx(newTxMeta)
    await this.approveTransaction(newTxMeta.id)
    return newTxMeta
  }

  /**
   * Creates a new approved transaction to attempt to speed up a previously submitted transaction. The
   * new transaction contains the same nonce as the previous. By default, the new transaction will use
   * the same gas limit and a 10% higher gas price, though it is possible to set a custom value for
   * each instead.
   * @param {number} originalTxId - the id of the txMeta that you want to speed up
   * @param {string} [customGasPrice] - The new custom gas price, in hex
   * @param {string} [customGasLimit] - The new custom gas limt, in hex
   * @returns {txMeta}
   */
  async createSpeedUpTransaction (originalTxId, customGasPrice, customGasLimit) {
    const originalTxMeta = this.txStateManager.getTx(originalTxId)
    const { txParams } = originalTxMeta
    const { gasPrice: lastGasPrice } = txParams

    const fees = replacementFees(txParams, customGasPrice)

    const newTxMeta = this.txStateManager.generateTxMeta({
      txParams: {
        ...txParams,
        ...fees,
      },
      lastGasPrice,
      origin: originalTxMeta.origin,
      signingChainId: originalTxMeta.signingChainId,
      ...(txParams.maxFeePerGas ? { lastMaxFeePerGas: txParams.maxFeePerGas } : {}),
      loadingDefaults: false,
      status: TRANSACTION_STATUS_APPROVED,
      type: TRANSACTION_TYPE_RETRY,
    })

    if (customGasLimit) {
      newTxMeta.txParams.gas = customGasLimit
    }

    this.addTx(newTxMeta)
    await this.approveTransaction(newTxMeta.id)
    return newTxMeta
  }

  /**
  updates the txMeta in the txStateManager
  @param {Object} txMeta - the updated txMeta
  */
  async updateTransaction (txMeta) {
    txUtils.validateTxParams(txMeta.txParams)
    this.txStateManager.updateTx(txMeta, 'confTx: user updated transaction')
  }

  /**
  updates and approves the transaction
  @param {Object} txMeta
  */
  async updateAndApproveTransaction (txMeta) {
    txUtils.validateTxParams(txMeta.txParams)
    this.txStateManager.updateTx(txMeta, 'confTx: user approved transaction')
    await this.approveTransaction(txMeta.id)
  }

  /**
  sets the tx status to approved
  auto fills the nonce
  signs the transaction
  publishes the transaction
  if any of these steps fails the tx status will be set to failed
    @param {number} txId - the tx's Id
  */
  async approveTransaction (txId) {
    const { networkGeneration } = this
    // TODO: Move this safety out of this function.
    // Since this transaction is async,
    // we need to keep track of what is currently being signed,
    // So that we do not increment nonce + resubmit something
    // that is already being incremented & signed.
    if (this.inProcessOfSigning.has(txId)) {
      return
    }
    this.inProcessOfSigning.add(txId)
    let nonceLock
    try {
      // approve
      this.txStateManager.setTxStatusApproved(txId)
      // get next nonce
      const txMeta = this.txStateManager.getTx(txId)
      const fromAddress = txMeta.txParams.from
      // wait for a nonce
      let { customNonceValue } = txMeta
      customNonceValue = Number(customNonceValue)
      nonceLock = await this.nonceTracker.getNonceLock(fromAddress)
      this.assertNetworkGeneration(networkGeneration)
      // add nonce to txParams
      // Preserve explicit and replacement nonces; otherwise allocate the next nonce.
      const nonce = txMeta.txParams.nonce === undefined ? nonceLock.nextNonce : txMeta.txParams.nonce
      const customOrNonce = (customNonceValue === 0) ? customNonceValue : customNonceValue || nonce

      txMeta.txParams.nonce = ethUtil.addHexPrefix(customOrNonce.toString(16))
      // add nonce debugging information to txMeta
      txMeta.nonceDetails = nonceLock.nonceDetails
      if (customNonceValue) {
        txMeta.nonceDetails.customNonceValue = customNonceValue
      }
      this.txStateManager.updateTx(txMeta, 'transactions#approveTransaction')
      // sign transaction
      const rawTx = await this.signTransaction(txId)
      await this.publishTransaction(txId, rawTx, networkGeneration)
      // must set transaction to submitted/failed before releasing lock
      nonceLock.releaseLock()
    } catch (err) {
      // this is try-catch wrapped so that we can guarantee that the nonceLock is released
      try {
        this.txStateManager.setTxStatusFailed(txId, err)
      } catch (err2) {
        log.error(err2)
      }
      // must set transaction to submitted/failed before releasing lock
      if (nonceLock) {
        nonceLock.releaseLock()
      }
      // continue with error chain
      throw err
    } finally {
      this.inProcessOfSigning.delete(txId)
    }
  }

  /**
    adds the chain id and signs the transaction and set the status to signed
    @param {number} txId - the tx's Id
    @returns {string} - rawTx
  */
  async signTransaction (txId) {
    const { networkGeneration } = this
    const txMeta = this.txStateManager.getTx(txId)
    // add network/chain id
    const chainId = this.getChainId()
    const txParams = { ...txMeta.txParams, chainId }
    // sign tx
    const fromAddress = txParams.from
    txUtils.validateTxParams(txMeta.txParams)
    if (!Number.isSafeInteger(chainId) || chainId <= 0 ||
        (txMeta.signingChainId !== undefined && txMeta.signingChainId !== chainId) ||
        (txMeta.txParams.chainId && Number(txMeta.txParams.chainId) !== chainId)) {
      throw new Error('Invalid transaction chainId for the selected network')
    }
    if (Number(txParams.type) === 4 && txMeta.origin !== 'ecf-wallet') {
      throw new Error('External EIP-7702 transactions are not supported')
    }
    if (Number(txParams.type)) {
      txMeta.txParams.chainId = `0x${chainId.toString(16)}`
    }
    const unsignedTx = createTransaction(txParams, chainId)
    const expectedMessage = Number(txParams.type) ? Buffer.from(unsignedTx.getHashedMessageToSign()) : undefined
    const ethTx = await this.signEthTx(unsignedTx, fromAddress) || unsignedTx
    this.assertNetworkGeneration(networkGeneration)
    if (this.getChainId() !== chainId) {
      throw new Error('Network changed while signing. Please submit the transaction again.')
    }
    if (expectedMessage && (!Number(ethTx.type) ||
        !expectedMessage.equals(Buffer.from(ethTx.getHashedMessageToSign())) ||
        ethTx.getSenderAddress().toString().toLowerCase() !== fromAddress.toLowerCase())) {
      throw new Error('The signed transaction does not match the approved transaction or account')
    }
    if (!ethTx.verifySignature()) {
      throw new Error('The signer returned an invalid transaction signature')
    }

    // add r,s,v values for provider request purposes see createEcfWalletMiddleware
    // and JSON rpc standard for further explanation
    const signatureHex = (value) => (typeof value === 'bigint' ? `0x${value.toString(16)}` : ethUtil.bufferToHex(value))
    txMeta.r = signatureHex(ethTx.r)
    txMeta.s = signatureHex(ethTx.s)
    txMeta.v = signatureHex(ethTx.v)

    this.txStateManager.updateTx(txMeta, 'transactions#signTransaction: add r, s, v values')

    // set state to signed
    this.txStateManager.setTxStatusSigned(txMeta.id)
    const rawTx = ethUtil.bufferToHex(Buffer.from(ethTx.serialize()))
    return rawTx
  }

  assertNetworkGeneration (generation) {
    if (generation !== this.networkGeneration) {
      throw new Error('Network changed while signing. Please submit the transaction again.')
    }
  }

  /**
    publishes the raw tx and sets the txMeta to submitted
    @param {number} txId - the tx's Id
    @param {string} rawTx - the hex string of the serialized signed transaction
    @param {number} networkGeneration - the network generation when approval began
    @returns {Promise<void>}
  */
  async publishTransaction (txId, rawTx, networkGeneration = this.networkGeneration) {
    this.assertNetworkGeneration(networkGeneration)
    const txMeta = this.txStateManager.getTx(txId)
    const chainId = txMeta?.signingChainId ?? txMeta?.txParams?.chainId
    if (!txMeta || (chainId !== undefined && Number(chainId) !== this.getChainId())) {
      throw new Error('Network changed before publishing. Please submit the transaction again.')
    }
    txMeta.rawTx = rawTx
    this.txStateManager.updateTx(txMeta, 'transactions#publishTransaction')
    let txHash
    try {
      txHash = await this.query.sendRawTransaction(rawTx)
    } catch (error) {
      if (error.message.toLowerCase().includes('known transaction')) {
        txHash = ethUtil.sha3(ethUtil.addHexPrefix(rawTx)).toString('hex')
        txHash = ethUtil.addHexPrefix(txHash)
      } else {
        throw error
      }
    }
    this.setTxHash(txId, txHash)

    this.txStateManager.setTxStatusSubmitted(txId)
  }

  /**
   * Sets the status of the transaction to confirmed and sets the status of nonce duplicates as
   * dropped if the txParams have data it will fetch the txReceipt
   * @param {number} txId - The tx's ID
   * @returns {Promise<void>}
   */
  async confirmTransaction (txId, txReceipt) {
    // get the txReceipt before marking the transaction confirmed
    // to ensure the receipt is gotten before the ui revives the tx
    const txMeta = this.txStateManager.getTx(txId)

    if (!txMeta) {
      return
    }

    try {

      // It seems that sometimes the numerical values being returned from
      // this.query.getTransactionReceipt are BN instances and not strings.
      const gasUsed = typeof txReceipt.gasUsed === 'string'
        ? txReceipt.gasUsed
        : txReceipt.gasUsed.toString(16)

      txMeta.txReceipt = {
        ...txReceipt,
        gasUsed,
      }

      this.txStateManager.updateTx(txMeta, 'transactions#confirmTransaction - add txReceipt')
    } catch (err) {
      log.error(err)
    }

    this.txStateManager.setTxStatusConfirmed(txId)
    this._markNonceDuplicatesDropped(txId)
  }

  /**
    Convenience method for the ui thats sets the transaction to rejected
    @param {number} txId - the tx's Id
    @returns {Promise<void>}
  */
  async cancelTransaction (txId) {
    this.txStateManager.setTxStatusRejected(txId)
  }

  /**
    Sets the txHas on the txMeta
    @param {number} txId - the tx's Id
    @param {string} txHash - the hash for the txMeta
  */
  setTxHash (txId, txHash) {
    // Add the tx hash to the persisted meta-tx object
    const txMeta = this.txStateManager.getTx(txId)
    txMeta.hash = txHash
    this.txStateManager.updateTx(txMeta, 'transactions#setTxHash')
  }

  //
  //           PRIVATE METHODS
  //
  /** maps methods for convenience*/
  _mapMethods () {

    /** @returns {Object} - the state in transaction controller */
    this.getState = () => this.memStore.getState()

    /** @returns {string|number} - the network number stored in networkStore */
    this.getNetwork = () => this.networkStore.getState()

    /** @returns {string} - the user selected address */
    this.getSelectedAddress = () => this.preferencesStore.getState().selectedAddress

    /** @returns {array} - transactions whos status is unapproved */
    this.getUnapprovedTxCount = () => Object.keys(this.txStateManager.getUnapprovedTxList()).length

    /**
      @returns {number} - number of transactions that have the status submitted
      @param {string} account - hex prefixed account
    */
    this.getPendingTxCount = (account) => this.txStateManager.getPendingTransactions(account).length

    /** see txStateManager */
    this.getFilteredTxList = (opts) => this.txStateManager.getFilteredTxList(opts)
  }

  // called once on startup
  async _updatePendingTxsAfterFirstBlock () {
    // wait for first block so we know we're ready
    await this.blockTracker.getLatestBlock()
    // get status update for all pending transactions (for the current network)
    await this.pendingTxTracker.updatePendingTxs()
  }

  /**
    If transaction controller was rebooted with transactions that are uncompleted
    in steps of the transaction signing or user confirmation process it will either
    transition txMetas to a failed state or try to redo those tasks.
  */

  _onBootCleanUp () {
    this.txStateManager.getFilteredTxList({
      status: 'unapproved',
      loadingDefaults: true,
    }).forEach((tx) => {

      this.addTxGasDefaults(tx)
        .then((txMeta) => {
          txMeta.loadingDefaults = false
          this.txStateManager.updateTx(txMeta, 'transactions: gas estimation for tx on boot')
        }).catch((error) => {
          const txMeta = this.txStateManager.getTx(tx.id)
          txMeta.loadingDefaults = false
          this.txStateManager.updateTx(txMeta, 'failed to estimate gas during boot cleanup.')
          this.txStateManager.setTxStatusFailed(txMeta.id, error)
        })
    })

    this.txStateManager.getFilteredTxList({
      status: TRANSACTION_STATUS_APPROVED,
    }).forEach((txMeta) => {
      const txSignError = new Error('Transaction found as "approved" during boot - possibly stuck during signing')
      this.txStateManager.setTxStatusFailed(txMeta.id, txSignError)
    })
  }

  /**
    is called in constructor applies the listeners for pendingTxTracker txStateManager
    and blockTracker
  */
  _setupListeners () {
    this.txStateManager.on('tx:status-update', this.emit.bind(this, 'tx:status-update'))
    this._setupBlockTrackerListener()
    this.pendingTxTracker.on('tx:warning', (txMeta) => {
      this.txStateManager.updateTx(txMeta, 'transactions/pending-tx-tracker#event: tx:warning')
    })
    this.pendingTxTracker.on('tx:failed', this.txStateManager.setTxStatusFailed.bind(this.txStateManager))
    this.pendingTxTracker.on('tx:confirmed', (txId, transactionReceipt) => this.confirmTransaction(txId, transactionReceipt))
    this.pendingTxTracker.on('tx:dropped', this.txStateManager.setTxStatusDropped.bind(this.txStateManager))
    this.pendingTxTracker.on('tx:block-update', (txMeta, latestBlockNumber) => {
      if (!txMeta.firstRetryBlockNumber) {
        txMeta.firstRetryBlockNumber = latestBlockNumber
        this.txStateManager.updateTx(txMeta, 'transactions/pending-tx-tracker#event: tx:block-update')
      }
    })
    this.pendingTxTracker.on('tx:retry', (txMeta) => {
      if (!('retryCount' in txMeta)) {
        txMeta.retryCount = 0
      }
      txMeta.retryCount += 1
      this.txStateManager.updateTx(txMeta, 'transactions/pending-tx-tracker#event: tx:retry')
    })
  }

  /**
    Returns a "type" for a transaction out of the following list: simpleSend, tokenTransfer, tokenApprove,
    contractDeployment, contractMethodCall
  */
  async _determineTransactionCategory (txParams) {
    const { data, to } = txParams
    const { name } = (data && abiDecoder.decodeMethod(data)) || {}
    const tokenMethodName = [
      TOKEN_METHOD_APPROVE,
      TOKEN_METHOD_TRANSFER,
      TOKEN_METHOD_TRANSFER_FROM,
    ].find((methodName) => methodName === name && name.toLowerCase())

    let result
    if (txParams.data && tokenMethodName) {
      result = tokenMethodName
    } else if (txParams.data && !to) {
      result = DEPLOY_CONTRACT_ACTION_KEY
    }

    let code
    if (!result) {
      try {
        code = await this.query.getCode(to)
      } catch (e) {
        code = null
        log.warn(e)
      }

      const codeIsEmpty = !code || code === '0x' || code === '0x0'

      result = codeIsEmpty ? SEND_ETHER_ACTION_KEY : CONTRACT_INTERACTION_KEY
    }

    return { transactionCategory: result, getCodeResponse: code }
  }

  /**
    Sets other txMeta statuses to dropped if the txMeta that has been confirmed has other transactions
    in the list have the same nonce

    @param {number} txId - the txId of the transaction that has been confirmed in a block
  */
  _markNonceDuplicatesDropped (txId) {
    // get the confirmed transactions nonce and from address
    const txMeta = this.txStateManager.getTx(txId)
    const { nonce, from } = txMeta.txParams
    const sameNonceTxs = this.txStateManager.getFilteredTxList({ nonce, from })
    if (!sameNonceTxs.length) {
      return
    }
    // mark all same nonce transactions as dropped and give i a replacedBy hash
    sameNonceTxs.forEach((otherTxMeta) => {
      if (otherTxMeta.id === txId) {
        return
      }
      otherTxMeta.replacedBy = txMeta.hash
      this.txStateManager.updateTx(txMeta, 'transactions/pending-tx-tracker#event: tx:confirmed reference to confirmed txHash with same nonce')
      this.txStateManager.setTxStatusDropped(otherTxMeta.id)
    })
  }

  _setupBlockTrackerListener () {
    let listenersAreActive = false
    const latestBlockHandler = this._onLatestBlock.bind(this)
    const { blockTracker, txStateManager } = this

    txStateManager.on('tx:status-update', updateSubscription)
    updateSubscription()

    function updateSubscription () {
      const pendingTxs = txStateManager.getPendingTransactions()
      if (!listenersAreActive && pendingTxs.length > 0) {
        blockTracker.on('latest', latestBlockHandler)
        listenersAreActive = true
      } else if (listenersAreActive && !pendingTxs.length) {
        blockTracker.removeListener('latest', latestBlockHandler)
        listenersAreActive = false
      }
    }
  }

  async _onLatestBlock (blockNumber) {
    try {
      await this.pendingTxTracker.updatePendingTxs()
    } catch (err) {
      log.error(err)
    }
    try {
      await this.pendingTxTracker.resubmitPendingTxs(blockNumber)
    } catch (err) {
      log.error(err)
    }
  }

  /**
    Updates the memStore in transaction controller
  */
  _updateMemstore () {
    const unapprovedTxs = this.txStateManager.getUnapprovedTxList()
    const currentNetworkTxList = this.txStateManager.getTxList(MAX_MEMSTORE_TX_LIST_SIZE)
    this.memStore.updateState({ unapprovedTxs, currentNetworkTxList })
  }

}
