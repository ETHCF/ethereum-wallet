import { Duplex } from 'readable-stream'

/**
 * A dapp connection reconnects on demand after a background worker suspends.
 * Outstanding RPC requests fail explicitly; signing requests are never replayed.
 */
export default class ReconnectingPortStream extends Duplex {
  constructor (connect) {
    super({ objectMode: true })
    this.connect = connect
    this.port = null
    this.pending = new Map()
    this.open()
  }

  open () {
    if (this.port) {
      return
    }
    const port = this.connect()
    this.port = port
    port.onMessage.addListener((message) => {
      if (port !== this.port) {
        return
      }
      if (message.name === 'provider' && message.data?.id !== undefined) {
        this.pending.delete(message.data.id)
      }
      this.push(message)
    })
    port.onDisconnect.addListener(() => {
      if (port !== this.port) {
        return
      }
      this.port = null
      for (const id of this.pending.keys()) {
        this.push({
          name: 'provider', data: {
            jsonrpc: '2.0', id,
            error: { code: 4900, message: 'ecf-wallet restarted. Please retry your request.' },
          },
        })
      }
      this.pending.clear()
    })
  }

  _read () {
    // Incoming messages are pushed by the browser port listener.
  }

  _write (message, _encoding, callback) {
    try {
      this.open()
      if (message.name === 'provider' && message.data?.method && message.data.id !== undefined) {
        this.pending.set(message.data.id, true)
      }
      this.port.postMessage(message)
      return callback()
    } catch (error) {
      return callback(error)
    }
  }

  _destroy (error, callback) {
    const { port } = this
    this.port = null
    this.pending.clear()
    if (port) {
      port.disconnect()
    }
    callback(error)
  }
}
