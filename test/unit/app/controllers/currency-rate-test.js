import { strict as assert } from 'assert'
import CurrencyRateController from '../../../../app/scripts/controllers/currency-rate'

const deferred = () => {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}
const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body })

describe('CurrencyRateController', function () {
  let controller

  afterEach(function () {
    clearTimeout(controller._handle)
  })

  it('keeps persisted state and does not fetch until a currency is selected', async function () {
    const urls = []
    controller = new CurrencyRateController({ currentCurrency: 'eur', conversionRate: 2 }, { fetch: async (url) => urls.push(url) })
    await controller.updateExchangeRate()
    assert.deepEqual(urls, [])
    assert.equal(controller.state.currentCurrency, 'eur')
    assert.equal(controller.state.conversionRate, 2)
  })

  it('sets the selection synchronously and stores the fetched rate', async function () {
    const urls = []
    controller = new CurrencyRateController(undefined, {
      fetch: async (url) => {
        urls.push(url)
        return reply({ JPY: 1.5 })
      },
    })
    const pending = controller.setCurrency({ currentCurrency: 'jpy', nativeCurrency: 'ETH' })
    assert.equal(controller.state.currentCurrency, 'jpy')
    assert.equal(controller.state.conversionRate, 0)
    await pending
    assert.equal(controller.state.conversionRate, 1.5)
    assert.deepEqual(urls, ['https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=JPY'])
  })

  it('drops a rate fetched for a previous selection', async function () {
    const replies = []
    controller = new CurrencyRateController(undefined, {
      fetch: () => {
        const next = deferred()
        replies.push(next)
        return next.promise
      },
    })
    const usd = controller.setCurrency({ currentCurrency: 'usd', nativeCurrency: 'ETH' })
    const eur = controller.setCurrency({ currentCurrency: 'eur', nativeCurrency: 'ETH' })
    replies[1].resolve(reply({ EUR: 3 }))
    await eur
    replies[0].resolve(reply({ USD: 4 }))
    await usd
    assert.equal(controller.state.currentCurrency, 'eur')
    assert.equal(controller.state.conversionRate, 3)
  })

  it('keeps the last good rate when a fetch fails or returns garbage', async function () {
    const bodies = [reply({ USD: 5 }), reply({ USD: 'nope' }), reply({}, 500)]
    controller = new CurrencyRateController(undefined, { fetch: async () => bodies.shift() })
    await controller.setCurrency({ currentCurrency: 'usd', nativeCurrency: 'ETH' })
    await controller.updateExchangeRate()
    await controller.updateExchangeRate()
    assert.equal(controller.state.conversionRate, 5)
  })
})
