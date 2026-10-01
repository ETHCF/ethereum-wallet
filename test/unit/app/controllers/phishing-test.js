import { strict as assert } from 'assert'
import PhishingController from '../../../../app/scripts/controllers/phishing'

const list = { version: 2, tolerance: 1, fuzzylist: [], whitelist: [], blacklist: ['evil.test'] }
const reply = (body, status = 200, etag = '') => ({
  ok: status === 200,
  status,
  json: async () => body,
  headers: { get: () => etag },
})

// The constructor starts the first poll; let it finish.
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('PhishingController', function () {
  let controller

  afterEach(function () {
    clearTimeout(controller._handle)
  })

  it('uses the bundled list until a download succeeds', async function () {
    controller = new PhishingController({ fetch: async () => reply({}, 500) })
    await flush()
    assert.equal(controller.test('ethcf.org'), false)
    assert.equal(controller.test('evil.test'), false)
    assert.equal(controller.test('nfts-mints.com'), true)
  })

  it('applies a downloaded list and sends its ETag next time', async function () {
    const requests = []
    controller = new PhishingController({
      fetch: async (_, opts) => {
        requests.push(opts.headers['If-None-Match'])
        return reply(list, 200, 'v1')
      },
    })
    await flush()
    assert.equal(controller.test('evil.test'), true)
    await controller.updatePhishingList()
    assert.deepEqual(requests, ['', 'v1'])
  })

  it('keeps the current list when a download is empty or malformed', async function () {
    const bodies = [reply(list), reply({}), reply({ ...list, blacklist: [] }), reply({ ...list, whitelist: [1] }), reply(null)]
    controller = new PhishingController({ fetch: async () => bodies.shift() })
    await flush()
    for (let i = 0; i < 4; i++) {
      await assert.rejects(controller.updatePhishingList(), /Invalid phishing list/u)
    }
    assert.equal(controller.test('evil.test'), true)
  })

  it('stops warning about a bypassed hostname', async function () {
    controller = new PhishingController({ fetch: async () => reply(list) })
    await flush()
    controller.bypass('evil.test')
    assert.equal(controller.test('evil.test'), false)
  })
})
