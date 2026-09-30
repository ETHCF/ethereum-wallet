import { strict as assert } from 'assert'
import { recoverTypedSignature, recoverPersonalSignature } from '@metamask/eth-sig-util'
import { privateToAddress } from 'ethereumjs-util'
import PersonalMessageManager from '../../../app/scripts/lib/personal-message-manager'
import TypedMessageManager from '../../../app/scripts/lib/typed-message-manager'
import KeyringController from '../../../app/scripts/lib/modern-keyring-controller'
import { detectSIWE, validateTypedData } from '../../../app/scripts/lib/signing-utils'

const key = Buffer.alloc(32, 1)
const from = `0x${privateToAddress(key).toString('hex')}`
const origin = 'https://example.com'
const now = Date.parse('2026-09-30T12:00:00Z')
const text = `example.com wants you to sign in with your Ethereum account:
${from}

Sign in to Example.

URI: https://example.com/login
Version: 1
Chain ID: 1
Nonce: abcdef12
Issued At: 2026-09-30T11:00:00Z
Expiration Time: 2099-01-01T00:00:00Z
Resources:
- https://example.com/profile`
const hex = (message) => `0x${Buffer.from(message, 'utf8').toString('hex')}`
const data = {
  types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Item: [{ name: 'values', type: 'uint256[]' }, { name: 'enabled', type: 'bool' }] },
  primaryType: 'Item', domain: { chainId: 1 }, message: { values: ['1', '2'], enabled: false },
}

function typedManager () {
  return new TypedMessageManager({ networkController: { getNetworkState: () => '1' } })
}

describe('Modern message signing', function () {
  it('signs V4 arrays with the current implementation and recovers the software account', async function () {
    const controller = new KeyringController({})
    const SoftwareKeyring = controller.keyringTypes.find((Type) => Type.type === 'Simple Key Pair')
    controller.keyrings = [new SoftwareKeyring([key.toString('hex')])]
    const signature = await controller.signTypedMessage({ from, data }, { version: 'V4' })
    assert.equal(recoverTypedSignature({ data, signature, version: 'V4' }), from)
    assert.throws(() => validateTypedData(data, 'V3'), /Arrays/u)
  })

  it('accepts object V4 requests, preserves reviewed bytes, and rejects payload substitution', async function () {
    const manager = typedManager()
    const request = JSON.parse(JSON.stringify(data))
    const id = manager.addUnapprovedMessage({ from, data: request }, { origin }, 'V4')
    request.message.values[0] = '999'
    const approved = await manager.approveMessage({ metamaskId: id, from, data: JSON.stringify(request) })
    assert.deepEqual(JSON.parse(approved.data), data)
    assert.equal(manager.getMsg(id).msgParams.version, 'V4')
    assert.throws(() => manager.approveMessage({ metamaskId: id }), /not awaiting approval/u)
  })

  it('validates values, types, and domain chain ID before showing approval', function () {
    const manager = typedManager()
    for (const invalid of [
      { ...data, domain: { chainId: 0 } },
      { ...data, domain: { chainId: 2 } },
      { ...data, message: { values: ['not a number'], enabled: false } },
      { ...data, primaryType: 'Missing' },
    ]) {
      assert.throws(() => manager.addUnapprovedMessage({ from, data: invalid }, { origin }, 'V4'))
    }
    assert.throws(() => manager.addUnapprovedMessage({ from, data: [{ name: 'invalid', type: 'uint32', value: '$$$' }] }, { origin }, 'V1'))
  })

  it('compares large EIP-712 chain IDs without rounding', function () {
    const manager = new TypedMessageManager({ networkController: { getChainId: () => '0x20000000000000' } })
    assert.throws(() => manager.addUnapprovedMessage({ from, data: { ...data, domain: { chainId: '9007199254740993' } } }, { origin }, 'V4'), /must match/u)
    assert.doesNotThrow(() => manager.addUnapprovedMessage({ from, data: { ...data, domain: { chainId: '9007199254740992' } } }, { origin }, 'V4'))
  })

  it('parses SIWE fields without changing the signed message', async function () {
    const manager = new PersonalMessageManager({ getChainId: () => '1' })
    const id = manager.addUnapprovedMessage({ from, data: hex(text) }, { origin })
    const stored = manager.getMsg(id).msgParams
    assert.equal(stored.siwe.parsedMessage.domain, 'example.com')
    assert.deepEqual(stored.siwe.parsedMessage.resources, ['https://example.com/profile'])
    assert.deepEqual(stored.siwe.errors, [])
    const approved = await manager.approveMessage({ metamaskId: id, data: hex('substituted') })
    assert.equal(approved.data, hex(text))
    const controller = new KeyringController({})
    const SoftwareKeyring = controller.keyringTypes.find((Type) => Type.type === 'Simple Key Pair')
    controller.keyrings = [new SoftwareKeyring([key.toString('hex')])]
    const signature = await controller.signPersonalMessage(approved)
    assert.equal(recoverPersonalSignature({ data: hex(text), signature }), from)
  })

  it('checks origin authority, scheme and port, account, expiry, nonce, and syntax', function () {
    const check = (message = text, requestOrigin = origin, account = from) => detectSIWE({ data: hex(message), from: account, origin: requestOrigin }, '1', now)
    assert.deepEqual(check().errors, [])
    assert.ok(check(text, 'https://example.com.evil.test').errors.length)
    assert.ok(check(text, 'http://example.com').errors.length)
    assert.ok(check(text, 'https://example.com:8443').errors.length)
    assert.ok(check(text, origin, `0x${'2'.repeat(40)}`).errors.length)
    assert.ok(check(text.replace('2099-01-01', '2020-01-01')).errors.length)
    assert.ok(check(text.replace('Nonce: abcdef12', 'Nonce: abc')).errors.length)
    assert.ok(check(text.replace('Version: 1', 'Version: 2')).errors.length)
    assert.deepEqual(check(text.replace('example.com wants', 'http://example.com:8080 wants'), 'http://example.com:8080').errors, [])
    assert.equal(detectSIWE({ data: hex('A normal message'), from, origin }, 1), undefined)
  })

  it('rechecks SIWE before signing and does not trust caller-supplied parsed metadata', async function () {
    const manager = new PersonalMessageManager({ getChainId: () => '1' })
    const id = manager.addUnapprovedMessage({ from, data: hex(text), siwe: { errors: [] } }, { origin: 'https://evil.test' })
    assert.ok(manager.getMsg(id).msgParams.siwe.errors.length)
    await assert.rejects(manager.approveMessage({ metamaskId: id, origin, data: hex(text), siwe: { errors: [] } }), /does not match/u)
    assert.equal(manager.getMsg(id).status, 'unapproved')
  })
})
