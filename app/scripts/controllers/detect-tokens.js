import EthQuery from 'eth-query'
import pify from 'pify'
import contracts from 'eth-contract-metadata'
import { warn } from 'loglevel'
import getSingleCallBalances from '../lib/single-call-balances'
import { MAINNET } from './network/enums'

// By default, poll every 3 minutes
const DEFAULT_INTERVAL = 180 * 1000
const SINGLE_CALL_BALANCES_ADDRESS = '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39'

/**
 * A controller that polls for token exchange
 * rates based on a user's current token list
 */
export default class DetectTokensController {

  /**
   * Creates a DetectTokensController
   *
   * @param {Object} [config] - Options to configure controller
   */
  constructor ({ interval = DEFAULT_INTERVAL, preferences, network, keyringMemStore } = {}) {
    this.preferences = preferences
    this.interval = interval
    this.network = network
    this.keyringMemStore = keyringMemStore
  }

  /**
   * For each token in eth-contract-metadata, find check selectedAddress balance.
   */
  async detectNewTokens () {
    if (!this.isActive) {
      return
    }
    if (this._network.store.getState().provider.type !== MAINNET) {
      return
    }

    const tokensToDetect = []
    for (const contractAddress in contracts) {
      if (contracts[contractAddress].erc20 && !(this.tokenAddresses.includes(contractAddress.toLowerCase()))) {
        tokensToDetect.push(contractAddress)
      }
    }

    let result
    try {
      result = await this._getTokenBalances(tokensToDetect)
    } catch (error) {
      warn(`ecf-wallet - DetectTokensController single call balance fetch failed`, error)
      return
    }

    tokensToDetect.forEach((tokenAddress, index) => {
      const balance = result[index]
      if (balance && !balance.isZero()) {
        this._preferences.addToken(tokenAddress, contracts[tokenAddress].symbol, contracts[tokenAddress].decimals)
      }
    })
  }

  async _getTokenBalances (tokens) {
    const query = pify(new EthQuery(this._network._provider))
    return getSingleCallBalances(query, SINGLE_CALL_BALANCES_ADDRESS, [this.selectedAddress], tokens)
  }

  /**
   * Restart token detection polling period and call detectNewTokens
   * in case of address change or user session initialization.
   *
   */
  restartTokenDetection () {
    if (!(this.isActive && this.selectedAddress)) {
      return
    }
    this.detectNewTokens()
    this.interval = DEFAULT_INTERVAL
  }

  /**
   * @type {Number}
   */
  set interval (interval) {
    this._handle && clearInterval(this._handle)
    if (!interval) {
      return
    }
    this._handle = setInterval(() => {
      this.detectNewTokens()
    }, interval)
  }

  /**
   * In setter when selectedAddress is changed, detectNewTokens and restart polling
   * @type {Object}
   */
  set preferences (preferences) {
    if (!preferences) {
      return
    }
    this._preferences = preferences
    const currentTokens = preferences.store.getState().tokens
    this.tokenAddresses = currentTokens
      ? currentTokens.map((token) => token.address)
      : []
    preferences.store.subscribe(({ tokens = [] }) => {
      this.tokenAddresses = tokens.map((token) => {
        return token.address
      })
    })
    preferences.store.subscribe(({ selectedAddress }) => {
      if (this.selectedAddress !== selectedAddress) {
        this.selectedAddress = selectedAddress
        this.restartTokenDetection()
      }
    })
  }

  /**
   * @type {Object}
   */
  set network (network) {
    if (!network) {
      return
    }
    this._network = network
  }

  /**
   * In setter when isUnlocked is updated to true, detectNewTokens and restart polling
   * @type {Object}
   */
  set keyringMemStore (keyringMemStore) {
    if (!keyringMemStore) {
      return
    }
    this._keyringMemStore = keyringMemStore
    this._keyringMemStore.subscribe(({ isUnlocked }) => {
      if (this.isUnlocked !== isUnlocked) {
        this.isUnlocked = isUnlocked
        if (isUnlocked) {
          this.restartTokenDetection()
        }
      }
    })
  }

  /**
   * Internal isActive state
   * @type {Object}
   */
  get isActive () {
    return this.isOpen && this.isUnlocked
  }
}
