/* global globalThis */
import PhishingDetector from 'eth-phishing-detect/src/detector'
import DEFAULT_CONFIG from 'eth-phishing-detect/src/config.json'
import log from 'loglevel'

const CONFIG_URL = 'https://cdn.jsdelivr.net/gh/MetaMask/eth-phishing-detect@main/src/config.json'
// By default, refresh the list every hour
const DEFAULT_INTERVAL = 60 * 60 * 1000

/**
 * Checks hostnames against the eth-phishing-detect lists. Replaces
 * PhishingController from the legacy @metamask/controllers package.
 */
export default class PhishingController {

  /**
   * @param {Object} [opts]
   * @param {number} [opts.interval] - List refresh interval in milliseconds
   * @param {Function} [opts.fetch] - The fetch implementation
   */
  constructor ({ interval = DEFAULT_INTERVAL, fetch = globalThis.fetch.bind(globalThis) } = {}) {
    this.interval = interval
    this._fetch = fetch
    this._etag = ''
    this._detector = new PhishingDetector(DEFAULT_CONFIG)
    // Hostnames the user chose to visit despite the warning, for this session.
    this._safelist = new Set()
    this.poll()
  }

  /**
   * @param {string} hostname - The hostname to check
   * @returns {boolean} Whether the hostname is on the blocklist and not safelisted
   */
  test (hostname) {
    if (this._safelist.has(hostname)) {
      return false
    }
    return this._detector.check(hostname).result
  }

  /**
   * @param {string} hostname - The hostname to stop warning about
   */
  bypass (hostname) {
    this._safelist.add(hostname)
  }

  async poll () {
    clearTimeout(this._handle)
    try {
      await this.updatePhishingList()
    } catch (error) {
      log.warn('ecf-wallet - phishing list update failed', error)
    }
    this._handle = setTimeout(() => this.poll(), this.interval)
  }

  async updatePhishingList () {
    const response = await this._fetch(CONFIG_URL, { headers: { 'If-None-Match': this._etag } })
    if (response.status === 304 || response.status === 403) {
      return
    }
    if (!response.ok) {
      throw new Error(`Fetch failed with status '${response.status}' for request '${CONFIG_URL}'`)
    }
    const config = await response.json()
    // The detector accepts any object, so an empty or malformed list would
    // silently disable blocking. Keep the current list instead.
    const isList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')
    if (!config || !isList(config.blacklist) || !config.blacklist.length || !isList(config.whitelist) || !isList(config.fuzzylist)) {
      throw new Error('Invalid phishing list')
    }
    // Save the ETag only after the list is accepted, so a rejected list is retried.
    this._detector = new PhishingDetector(config)
    this._etag = response.headers.get('ETag') || ''
  }
}
