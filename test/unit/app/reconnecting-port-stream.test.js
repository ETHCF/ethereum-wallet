import { strict as assert } from 'assert'
import sinon from 'sinon'
import ReconnectingPortStream from '../../../app/scripts/lib/reconnecting-port-stream'

describe('Manifest V3 dapp connections', function () {
  function createPort () {
    const port = {
      onMessage: { addListener: sinon.stub() },
      onDisconnect: { addListener: sinon.stub() },
      postMessage: sinon.stub(),
      disconnect: sinon.stub(),
    }
    return port
  }

  function request (id) {
    return { name: 'provider', data: { id, method: 'personal_sign' } }
  }

  function assertReloadError (message, id) {
    assert.equal(message.name, 'provider')
    assert.equal(message.data.id, id)
    assert.equal(message.data.error.code, 4900)
    assert.match(message.data.error.message, /refresh/iu)
  }

  it('rejects requests after context invalidation during reconnect without breaking the stream', function () {
    const port = createPort()
    const connect = sinon.stub().returns(port)
    connect.onSecondCall().throws(new Error('Extension context invalidated.'))
    const stream = new ReconnectingPortStream(connect)
    const onError = sinon.spy()
    stream.on('error', onError)
    port.onDisconnect.addListener.firstCall.args[0]()

    stream.write(request(1))
    assertReloadError(stream.read(), 1)
    stream.write(request(2))
    assertReloadError(stream.read(), 2)
    assert.equal(connect.callCount, 2, 'an invalidated context cannot reconnect')
    assert.equal(onError.callCount, 0)
    assert.equal(stream.destroyed, false)
    stream.destroy()
  })

  it('handles an already invalidated context on initial connection', function () {
    const connect = sinon.stub().throws(new Error('Extension context invalidated.'))
    const stream = new ReconnectingPortStream(connect)
    stream.write(request(0))
    assertReloadError(stream.read(), 0)
    assert.equal(connect.callCount, 1)
    stream.destroy()
  })

  it('rejects every pending request when postMessage detects invalidation', function () {
    const port = createPort()
    const stream = new ReconnectingPortStream(() => port)
    stream.on('error', () => undefined)
    stream.write(request(1))
    port.postMessage.throws(new Error('Extension context invalidated.'))
    port.disconnect.throws(new Error('Extension context invalidated.'))
    stream.write(request(2))
    assertReloadError(stream.read(), 1)
    assertReloadError(stream.read(), 2)
    stream.write(request(3))
    assertReloadError(stream.read(), 3)
    assert.equal(port.postMessage.callCount, 2)
    assert.equal(stream.pending.size, 0)
    stream.destroy()
  })

  it('does not hide unexpected connection failures', function () {
    const error = new Error('Unexpected connection failure')
    assert.throws(() => new ReconnectingPortStream(() => {
      throw error
    }), error)
  })

  it('can destroy a port whose context was invalidated', function (done) {
    const port = createPort()
    port.disconnect.throws(new Error('Extension context invalidated.'))
    const stream = new ReconnectingPortStream(() => port)
    stream.on('error', done)
    stream.destroy(null, done)
  })

  it('keeps a request made synchronously in response to a worker disconnect pending', function (done) {
    const firstPort = createPort()
    const secondPort = createPort()
    const connect = sinon.stub().returns(firstPort)
    connect.onSecondCall().returns(secondPort)
    const stream = new ReconnectingPortStream(connect)
    stream.write(request(1))
    stream.once('data', () => {
      stream.write(request(2))
    })
    // Wait until the readable stream is flowing so the response is synchronous.
    setImmediate(() => {
      firstPort.onDisconnect.addListener.firstCall.args[0]()
      assert.equal(stream.pending.has(2), true)
      assert.equal(secondPort.postMessage.callCount, 1)
      stream.destroy()
      done()
    })
  })

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
