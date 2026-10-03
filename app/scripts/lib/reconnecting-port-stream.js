import { Duplex } from 'readable-stream'

const RELOAD_MESSAGE = 'ecf-wallet was reloaded or updated. Please refresh this page to reconnect.'

/**
 * Reads the error a port disconnected with. Chrome reports an expected
 * disconnect, such as the page entering the back/forward cache, as an
 * unchecked runtime.lastError unless the disconnect listener reads it.
 *
 * @param {Object} port - The disconnected port
 * @returns {Object|undefined} The error, if any
 */
function readDisconnectError (port) {
  return globalThis.chrome?.runtime?.lastError || port.error
}

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
    this.contextInvalidated = false
    this.open()
  }

  open () {
    if (this.port || this.contextInvalidated) {
      return
    }
    let port
    try {
      port = this.connect()
    } catch (error) {
      if (!this.handleContextInvalidation(error)) {
        throw error
      }
      return
    }
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
      readDisconnectError(port)
      if (port !== this.port) {
        return
      }
      this.port = null
      this.failPending('ecf-wallet restarted. Please retry your request.')
    })
  }

  failPending (message) {
    const ids = Array.from(this.pending.keys())
    // Clear before pushing: a response can synchronously trigger another request.
    this.pending.clear()
    for (const id of ids) {
      this.push({
        name: 'provider', data: {
          jsonrpc: '2.0', id,
          error: { code: 4900, message },
        },
      })
    }
  }

  handleContextInvalidation (error) {
    if (!error?.message?.includes('Extension context invalidated')) {
      return false
    }
    // Unlike a suspended worker, an invalidated content script cannot reconnect.
    // Keep the page transport alive so pending and future RPCs fail explicitly.
    this.contextInvalidated = true
    this.port = null
    this.failPending(RELOAD_MESSAGE)
    return true
  }

  _read () {
    // Incoming messages are pushed by the browser port listener.
  }

  _write (message, _encoding, callback) {
    try {
      if (message.name === 'provider' && message.data?.method && message.data.id !== undefined) {
        this.pending.set(message.data.id, true)
      }
      this.open()
      if (this.contextInvalidated) {
        this.failPending(RELOAD_MESSAGE)
        return callback()
      }
      this.port.postMessage(message)
      return callback()
    } catch (error) {
      if (this.handleContextInvalidation(error)) {
        return callback()
      }
      return callback(error)
    }
  }

  _destroy (error, callback) {
    const { port } = this
    this.port = null
    this.pending.clear()
    if (port) {
      try {
        port.disconnect()
      } catch (disconnectError) {
        if (!this.handleContextInvalidation(disconnectError)) {
          return callback(error || disconnectError)
        }
      }
    }
    return callback(error)
  }
}
