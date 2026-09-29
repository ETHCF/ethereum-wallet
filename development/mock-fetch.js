const responses = require('../test/data/fetch-mocks.json')

module.exports = function setupTestFetch () {
  const originalFetch = global.fetch.bind(global)
  global.fetch = async (input, ...args) => {
    const url = typeof input === 'string' ? input : input.url
    let response
    if ((/^https?:\/\/ethgasstation\.info\/json\/ethgasAPI/u).test(url)) {
      response = responses.ethGasBasic
    } else if ((/^https?:\/\/ethgasstation\.info\/json\/predictTable/u).test(url)) {
      response = responses.ethGasPredictTable
    } else if ((/chromeextensionmm/u).test(url)) {
      response = responses.metametrics
    }
    if (response) {
      return { ok: true, json: async () => JSON.parse(JSON.stringify(response)) }
    }
    return originalFetch(input, ...args)
  }
}
