// Extension installation is a browser-level CDP command; ChromeDriver's CDP
// endpoint sends commands to a page target instead.
module.exports = async function connectBrowser (driver) {
  const capabilities = await driver.getCapabilities()
  const address = capabilities.get('goog:chromeOptions').debuggerAddress
  const { webSocketDebuggerUrl } = await global.fetch(`http://${address}/json/version`).then((response) => response.json())
  const socket = new global.WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    const request = pending.get(message.id)
    if (request) {
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error) {
        request.reject(new Error(message.error.message))
      } else {
        request.resolve(message.result)
      }
    }
  })
  return {
    send (method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        nextId += 1
        const id = nextId
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`CDP request timed out: ${method}`))
        }, 10000)
        pending.set(id, { resolve, reject, timer })
        socket.send(JSON.stringify({ id, method, params, sessionId }))
      })
    },
    close () {
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('CDP connection closed'))
      }
      pending.clear()
      socket.close()
    },
  }
}
