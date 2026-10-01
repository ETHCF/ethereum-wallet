import { strict as assert } from 'assert'
import { freeze } from '../../../app/scripts/lib/freezeGlobals'

describe('freezeGlobals', function () {
  it('leaves a global that lockdown already made read-only alone instead of throwing', function () {
    const target = {}
    const value = { then: () => undefined }
    Object.defineProperty(target, 'Promise', { value, writable: false, configurable: false })
    assert.doesNotThrow(() => freeze(target, 'Promise'))
    assert.equal(target.Promise, value)
  })

  it('freezes a writable global', function () {
    const target = { Promise: { nested: {} } }
    freeze(target, 'Promise')
    const descriptor = Object.getOwnPropertyDescriptor(target, 'Promise')
    assert.equal(descriptor.writable, false)
    assert.equal(descriptor.configurable, false)
    assert.ok(Object.isFrozen(target.Promise.nested))
  })
})
