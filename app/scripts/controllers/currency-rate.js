/* global globalThis */
import ObservableStore from 'obs-store'
import log from 'loglevel'

// By default, poll every 3 minutes
const DEFAULT_INTERVAL = 180 * 1000

/**
 * Tracks the exchange rate between the network's native currency and the
 * user's display currency. Replaces CurrencyRateController from the legacy
 * @metamask/controllers package and keeps its persisted state shape.
 */
export default class CurrencyRateController {

  /**
   * @param {Object} [initState] - The persisted CurrencyController state
   * @param {Object} [opts]
   * @param {number} [opts.interval] - Polling interval in milliseconds
   * @param {Function} [opts.fetch] - The fetch implementation
   */
  constructor (initState = {}, { interval = DEFAULT_INTERVAL, fetch = globalThis.fetch.bind(globalThis) } = {}) {
    this.store = new ObservableStore({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'usd',
      nativeCurrency: 'ETH',
      ...initState,
    })
    this.interval = interval
    this._fetch = fetch
    // No rates are fetched until a currency is selected, as before.
    this._active = false
    this.poll()
  }

  get state () {
    return this.store.getState()
  }

  /**
   * Selects the currencies to convert between and refreshes the rate.
   *
   * @param {Object} selection
   * @param {string} selection.currentCurrency - The display currency code
   * @param {string} selection.nativeCurrency - The network's native currency ticker
   * @returns {Promise<void>}
   */
  setCurrency ({ currentCurrency, nativeCurrency }) {
    this._active = true
    const previous = this.state
    if (previous.currentCurrency !== currentCurrency || previous.nativeCurrency !== nativeCurrency) {
      // Never show the previous pair's rate under the new currency labels.
      this.store.updateState({ currentCurrency, nativeCurrency, conversionRate: 0, conversionDate: 0 })
    }
    return this.updateExchangeRate()
  }

  async poll () {
    clearTimeout(this._handle)
    await this.updateExchangeRate()
    this._handle = setTimeout(() => this.poll(), this.interval)
  }

  async updateExchangeRate () {
    const { currentCurrency, nativeCurrency } = this.state
    if (!this._active || !currentCurrency || !nativeCurrency) {
      return
    }
    try {
      const conversionRate = await this.fetchExchangeRate(currentCurrency, nativeCurrency)
      const latest = this.state
      // Drop replies for a selection that changed while the request was in flight.
      if (latest.currentCurrency !== currentCurrency || latest.nativeCurrency !== nativeCurrency) {
        return
      }
      this.store.updateState({ conversionRate, conversionDate: Date.now() / 1000 })
    } catch (error) {
      log.warn('ecf-wallet - currency rate fetch failed', error)
    }
  }

  async fetchExchangeRate (currentCurrency, nativeCurrency) {
    const to = currentCurrency.toUpperCase()
    const url = `https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(nativeCurrency.toUpperCase())}&tsyms=${encodeURIComponent(to)}`
    const response = await this._fetch(url)
    if (!response.ok) {
      throw new Error(`Fetch failed with status '${response.status}' for request '${url}'`)
    }
    const json = await response.json()
    const conversionRate = Number(json[to])
    if (!Number.isFinite(conversionRate)) {
      throw new Error(`Invalid response for ${to}: ${json[to]}`)
    }
    return conversionRate
  }
}
