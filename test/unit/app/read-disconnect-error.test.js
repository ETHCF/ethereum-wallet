import { strict as assert } from 'assert'
import readDisconnectError from '../../../app/scripts/lib/read-disconnect-error'

describe('readDisconnectError', function () {
  const bfcacheError = { message: 'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.' }
  let originalChrome

  beforeEach(function () {
    originalChrome = globalThis.chrome
  })

  afterEach(function () {
    globalThis.chrome = originalChrome
  })

  it('reads runtime.lastError so the browser does not report it as unchecked', function () {
    let lastErrorRead = false
    globalThis.chrome = {
      runtime: {
        get lastError () {
          lastErrorRead = true
          return bfcacheError
        },
      },
    }
    assert.equal(readDisconnectError({}), bfcacheError)
    assert.equal(lastErrorRead, true)
  })

  it('falls back to the port error outside Chrome', function () {
    globalThis.chrome = undefined
    assert.equal(readDisconnectError({ error: bfcacheError }), bfcacheError)
    assert.equal(readDisconnectError({}), undefined)
  })
})
