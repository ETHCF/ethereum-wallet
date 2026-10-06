/* Account Tracker
 *
 * This module is responsible for tracking any number of accounts
 * and caching their current balances & transaction counts.
 *
 * It also tracks transaction hashes, and checks their inclusion status
 * on each new block.
 */

import EthQuery from '@metamask/eth-query';
import { ObservableStore } from '@metamask/obs-store';
import log from 'loglevel';
import pify from 'pify';

import getSingleCallBalances from './single-call-balances';
import { bnToHex } from './util';
import { SINGLE_CALL_BALANCES_ADDRESS } from '../controllers/network/contract-addresses';
import { MAINNET_NETWORK_ID } from '../controllers/network/enums';

export default class AccountTracker {
  /**
   * This module is responsible for tracking any number of accounts and caching their current balances & transaction
   * counts.
   *
   * It also tracks transaction hashes, and checks their inclusion status on each new block.
   *
   * @typedef {object} AccountTracker
   * @param {object} opts - Initialize various properties of the class.
   * @property {object} store The stored object containing all accounts to track, as well as the current block's gas limit.
   * @property {object} store.accounts The accounts currently stored in this AccountTracker
   * @property {string} store.currentBlockGasLimit A hex string indicating the gas limit of the current block
   * @property {object} _provider A provider needed to create the EthQuery instance used within this AccountTracker.
   * @property {EthQuery} _query An EthQuery instance used to access account information from the blockchain
   * @property {object} _blockTracker A BlockTracker instance. Needed to ensure that accounts and their info updates
   * when a new block is created.
   * @property {object} _currentBlockNumber Reference to a property on the _blockTracker: the number (i.e. an id) of the the current block
   */
  constructor(opts = {}) {
    const initState = {
      accounts: {},
      currentBlockGasLimit: '',
    };
    this.store = new ObservableStore(initState);

    this._provider = opts.provider;
    this._query = pify(new EthQuery(this._provider));
    this._blockTracker = opts.blockTracker;
    // blockTracker.currentBlock may be null
    this._currentBlockNumber = this._blockTracker.getCurrentBlock();
    // Not a one-off 'latest' listener: removing the block tracker's last
    // listener stops it and rejects any getLatestBlock call in progress.
    this._blockTracker
      .getLatestBlock()
      .then((blockNumber) => {
        this._currentBlockNumber = blockNumber;
        return undefined;
      })
      .catch(() => undefined);
    // bind function for easier listener syntax
    this._updateForBlock = this._updateForBlock.bind(this);
    this.network = opts.network;
    this.networkGeneration = 0;
    this.balanceRequests = new Map();
    this.blockRequest = 0;
    if (this.network.on) {
      this.network.on('networkDidChange', () => {
        this.networkGeneration += 1;
        this.balanceRequests.clear();
        const accounts = Object.fromEntries(
          Object.keys(this.store.getState().accounts).map((address) => [
            address,
            {},
          ]),
        );
        this.store.updateState({ accounts, currentBlockGasLimit: '' });
      });
    }
  }

  start() {
    // remove first to avoid double add
    this._blockTracker.removeListener('latest', this._updateForBlock);
    // add listener
    this._blockTracker.addListener('latest', this._updateForBlock);
    // fetch account balances
    this.refresh();
  }

  stop() {
    // remove listener
    this._blockTracker.removeListener('latest', this._updateForBlock);
  }

  /**
   * Ensures that the locally stored accounts are in sync with a set of accounts stored externally to this
   * AccountTracker.
   *
   * Once this AccountTracker's accounts are up to date with those referenced by the passed addresses, each
   * of these accounts are given an updated balance via EthQuery.
   *
   * @param {Array} addresses - The array of hex addresses for accounts with which this AccountTracker's accounts should be
   * in sync
   */
  syncWithAddresses(addresses) {
    const { accounts } = this.store.getState();
    const locals = Object.keys(accounts);

    const accountsToAdd = [];
    addresses.forEach((upstream) => {
      if (!locals.includes(upstream)) {
        accountsToAdd.push(upstream);
      }
    });

    const accountsToRemove = [];
    locals.forEach((local) => {
      if (!addresses.includes(local)) {
        accountsToRemove.push(local);
      }
    });

    this.addAccounts(accountsToAdd);
    this.removeAccount(accountsToRemove);
  }

  /**
   * Adds new addresses to track the balances of
   * given a balance as long this._currentBlockNumber is defined.
   *
   * @param {Array} addresses - An array of hex addresses of new accounts to track
   */
  addAccounts(addresses) {
    const { accounts } = this.store.getState();
    // add initial state for addresses
    addresses.forEach((address) => {
      accounts[address] = {};
    });
    // save accounts state
    this.store.updateState({ accounts });
    // fetch balances for the accounts if there is block number ready
    if (!this._currentBlockNumber) {
      return;
    }
    this.refresh();
  }

  /**
   * Updates the balances in the background. A failed update is logged: the
   * next block or network change tries again.
   */
  refresh() {
    this._updateAccounts().catch((error) => log.error(error));
  }

  /**
   * Removes accounts from being tracked
   *
   * @param {Array} addresses - An array of hex addresses to stop tracking
   */
  removeAccount(addresses) {
    const { accounts } = this.store.getState();
    // remove each state object
    addresses.forEach((address) => {
      delete accounts[address];
      this.balanceRequests.delete(address);
    });
    // save accounts state
    this.store.updateState({ accounts });
  }

  /**
   * Removes all addresses and associated balances
   */

  clearAccounts() {
    this.balanceRequests.clear();
    this.store.updateState({ accounts: {} });
  }

  /**
   * Given a block, updates this AccountTracker's currentBlockGasLimit, and then updates each local account's balance
   * via EthQuery
   *
   * @private
   * @param {number} blockNumber - the block number to update to.
   * @fires 'block' The updated state, if all account updates are successful
   */
  async _updateForBlock(blockNumber) {
    const generation = this.networkGeneration;
    this.blockRequest += 1;
    const request = this.blockRequest;
    this._currentBlockNumber = blockNumber;

    // block gasLimit polling shouldn't be in account-tracker shouldn't be here...
    const currentBlock = await this._query.getBlockByNumber(blockNumber, false);
    if (
      !currentBlock ||
      generation !== this.networkGeneration ||
      request !== this.blockRequest
    ) {
      return;
    }
    const currentBlockGasLimit = currentBlock.gasLimit;
    this.store.updateState({ currentBlockGasLimit });

    try {
      await this._updateAccounts();
    } catch (err) {
      log.error(err);
    }
  }

  /**
   * balanceChecker is deployed on main eth (test)nets and requires a single call
   * for all other networks, calls this._updateAccount for each account in this.store
   *
   * @returns {Promise} after all account balances updated
   */
  async _updateAccounts() {
    const { accounts } = this.store.getState();
    const addresses = Object.keys(accounts);
    const currentNetwork = this.network.getNetworkState();

    switch (currentNetwork) {
      case MAINNET_NETWORK_ID.toString():
        await this._updateAccountsViaBalanceChecker(
          addresses,
          SINGLE_CALL_BALANCES_ADDRESS,
        );
        break;

      default:
        await Promise.all(addresses.map(this._updateAccount.bind(this)));
    }
  }

  /**
   * Updates the current balance of an account.
   *
   * @private
   * @param {string} address - A hex address of a the account to be updated
   * @returns {Promise} after the account balance is updated
   */
  async _updateAccount(address) {
    const request = this._beginBalanceRequest([address]);
    // query balance
    const balance = await this._query.getBalance(address);
    const result = { address, balance };
    // update accounts state
    const { accounts } = this.store.getState();
    // only populate if the entry is still present
    if (
      !accounts[address] ||
      !this._isCurrentBalanceRequest(address, request)
    ) {
      return;
    }
    this.store.updateState({ accounts: { ...accounts, [address]: result } });
  }

  _beginBalanceRequest(addresses) {
    const request = {
      generation: this.networkGeneration,
      network: this.network.getNetworkState(),
    };
    addresses.forEach((address) => this.balanceRequests.set(address, request));
    return request;
  }

  _isCurrentBalanceRequest(address, request) {
    return (
      this.balanceRequests.get(address) === request &&
      request.generation === this.networkGeneration &&
      request.network === this.network.getNetworkState()
    );
  }

  /**
   * Updates current address balances from balanceChecker deployed contract instance
   *
   * @param {string[]} addresses - The hex addresses whose balances to update.
   * @param {string} deployedContractAddress - The address of the balance checker contract.
   */
  async _updateAccountsViaBalanceChecker(addresses, deployedContractAddress) {
    const request = this._beginBalanceRequest(addresses);
    const ethBalance = ['0x0000000000000000000000000000000000000000'];

    try {
      const result = await getSingleCallBalances(
        this._query,
        deployedContractAddress,
        addresses,
        ethBalance,
      );
      const accounts = { ...this.store.getState().accounts };
      addresses.forEach((address, index) => {
        if (
          accounts[address] &&
          this._isCurrentBalanceRequest(address, request)
        ) {
          const balance = bnToHex(result[index]);
          accounts[address] = { address, balance };
        }
      });
      this.store.updateState({ accounts });
    } catch (error) {
      log.warn(
        `ecf-wallet - Account Tracker single call balance fetch failed`,
        error,
      );
      await Promise.all(
        addresses
          .filter((address) => this._isCurrentBalanceRequest(address, request))
          .map(this._updateAccount.bind(this)),
      );
    }
  }
}
