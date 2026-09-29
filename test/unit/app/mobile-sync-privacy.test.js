import { strict as assert } from 'assert'
import nock from 'nock'
import createMobileSyncClient from '../../../ui/app/helpers/utils/mobile-sync-client'

describe('Mobile sync privacy', function () {
  it('does not collect or attach latency telemetry to subsequent requests', async function () {
    const client = createMobileSyncClient({ subscribeKey: 'test', ssl: true, origin: 'mobile-sync.test' })
    const requests = nock('https://mobile-sync.test')
      .get('/time/0').query(true).delay(20).reply(200, [1000])
      .get('/time/0').query((params) => {
        assert.ok(!Object.keys(params).some((key) => key.startsWith('l_')))
        return true
      }).reply(200, [2000])
    try {
      await client.time()
      await client.time()
      assert.ok(requests.isDone())
      assert.deepEqual(client._telemetryManager._latencies, {})
      assert.deepEqual(client._telemetryManager._trackedLatencies, {})
    } finally {
      client.stop()
      nock.cleanAll()
    }
  })

  it('uses a fresh transport identifier for each mobile-sync session', function () {
    const first = createMobileSyncClient({ subscribeKey: 'test', ssl: true })
    const second = createMobileSyncClient({ subscribeKey: 'test', ssl: true })
    try {
      assert.notEqual(first.getUUID(), second.getUUID())
    } finally {
      first.stop()
      second.stop()
    }
  })
})
