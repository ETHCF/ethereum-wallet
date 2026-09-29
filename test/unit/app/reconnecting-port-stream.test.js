import { strict as assert } from 'assert'
import ReconnectingPortStream from '../../../app/scripts/lib/reconnecting-port-stream'

describe('Manifest V3 dapp connections', function () {
  it('reconnects on the next request and never replays an interrupted signing request', function (done) {
    const ports = []
    const stream = new ReconnectingPortStream(() => {
      const listeners = {}
      const port = {
        sent: [],
        onMessage: {
          addListener (listener) {
            listeners.message = listener
          },
        },
        onDisconnect: {
          addListener (listener) {
            listeners.disconnect = listener
          },
        },
        postMessage (message) {
          this.sent.push(message)
        },
        disconnect () {
          listeners.disconnect()
        },
      }
      ports.push(port)
      return port
    })
    stream.once('data', (message) => {
      assert.equal(message.data.id, 1)
      assert.equal(message.data.error.code, 4900)
      assert.equal(ports.length, 1, 'idle workers must not be woken by a reconnection loop')
      stream.write({ name: 'provider', data: { id: 2, method: 'eth_chainId' } }, (error) => {
        assert.ifError(error)
        assert.equal(ports.length, 2)
        assert.deepEqual(ports[1].sent.map((packet) => packet.data.method), ['eth_chainId'])
        stream.destroy()
        done()
      })
    })
    stream.write({ name: 'provider', data: { id: 1, method: 'personal_sign' } })
    ports[0].disconnect()
  })
})
