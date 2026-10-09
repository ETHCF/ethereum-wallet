import contracts from '@metamask/contract-metadata';
import EthQuery from '@metamask/eth-query';
import { warn } from 'loglevel';
import pify from 'pify';

import getSingleCallBalances from '../lib/single-call-balances';
import { MAINNET } from './network/enums';

// By default, poll every 3 minutes
const DEFAULT_INTERVAL = 180 * 1000;
const SINGLE_CALL_BALANCES_ADDRESS =
  '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39';

/**
 * A controller that polls, on mainnet, for the selected account's balances of
 * the known ERC20 tokens, and adds any token with a balance to its token list
 */
export default class DetectTokensController {
  /**
   * Creates a DetectTokensController
   *
   * @param {object} [config] - Options to configure controller
   * @param {number} [config.interval] - Polling interval in milliseconds.
   * @param {object} [config.preferences] - The preferences controller.
   * @param {object} [config.network] - The network controller.
   * @param {object} [config.keyringMemStore] - The keyring controller memory
   * store, used to track the unlocked state.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    preferences,
    network,
    keyringMemStore,
  } = {}) {
    this._preferences = preferences;
    this._network = network;
    if (preferences) {
      const currentTokens = preferences.store.getState().tokens;
      this.tokenAddresses = currentTokens
        ? currentTokens.map((token) => token.address)
        : [];
      preferences.store.subscribe(({ tokens = [] }) => {
        this.tokenAddresses = tokens.map((token) => {
          return token.address;
        });
      });
      // When selectedAddress changes, detectNewTokens and restart polling.
      preferences.store.subscribe(({ selectedAddress }) => {
        if (this.selectedAddress !== selectedAddress) {
          this.selectedAddress = selectedAddress;
          this.restartTokenDetection();
        }
      });
    }
    this.interval = interval;
    // When the wallet unlocks, detectNewTokens and restart polling.
    keyringMemStore?.subscribe(({ isUnlocked }) => {
      if (this.isUnlocked !== isUnlocked) {
        this.isUnlocked = isUnlocked;
        if (isUnlocked) {
          this.restartTokenDetection();
        }
      }
    });
  }

  /**
   * For each token in @metamask/contract-metadata, check the selectedAddress balance.
   */
  async detectNewTokens() {
    if (!this.isActive) {
      return;
    }
    if (this._network.store.getState().provider.type !== MAINNET) {
      return;
    }

    const tokensToDetect = [];
    for (const contractAddress in contracts) {
      if (
        contracts[contractAddress].erc20 &&
        !this.tokenAddresses.includes(contractAddress.toLowerCase())
      ) {
        tokensToDetect.push(contractAddress);
      }
    }

    let result;
    try {
      result = await this._getTokenBalances(tokensToDetect);
    } catch (error) {
      warn(
        `ecf-wallet - DetectTokensController single call balance fetch failed`,
        error,
      );
      return;
    }

    tokensToDetect.forEach((tokenAddress, index) => {
      const balance = result[index];
      if (balance && !balance.isZero()) {
        this._preferences.addToken(
          tokenAddress,
          contracts[tokenAddress].symbol,
          contracts[tokenAddress].decimals,
        );
      }
    });
  }

  async _getTokenBalances(tokens) {
    const query = pify(new EthQuery(this._network._provider));
    return getSingleCallBalances(
      query,
      SINGLE_CALL_BALANCES_ADDRESS,
      [this.selectedAddress],
      tokens,
    );
  }

  /**
   * Restart token detection polling period and call detectNewTokens
   * in case of address change or user session initialization.
   *
   */
  restartTokenDetection() {
    if (!(this.isActive && this.selectedAddress)) {
      return;
    }
    this.detectNewTokens();
    this.interval = DEFAULT_INTERVAL;
  }

  /**
   * Restarts polling with the given interval; a falsy value stops polling.
   *
   * @type {number}
   */
  set interval(interval) {
    this._handle && clearInterval(this._handle);
    if (!interval) {
      return;
    }
    this._handle = setInterval(() => {
      this.detectNewTokens();
    }, interval);
  }

  /**
   * Internal isActive state
   *
   * @type {object}
   */
  get isActive() {
    return this.isOpen && this.isUnlocked;
  }
}
