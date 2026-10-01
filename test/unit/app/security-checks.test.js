import { strict as assert } from 'assert'
import { encode as abiEncode } from '@metamask/abi-utils'
import {
  decodeCall,
  decodePermit,
  getTransactionAlerts,
  getTypedDataAlerts,
  isLookalike,
} from '../../../app/scripts/lib/security-checks'

const OWN = '0x1111111111111111111111111111111111111111'
const FRIEND = '0xabcd000000000000000000000000000000001234'
const LOOKALIKE = '0xabcd999999999999999999999999999999991234'
const STRANGER = '0x5555555555555555555555555555555555555555'
const TOKEN = '0x6b175474e89094c44da98b954eedeac495271d0f'
const SPENDER = '0x000000000022d473030f116ddee9f6b43ac78ba3'
const MAX = `0x${'f'.repeat(64)}`

const encode = (selector, types, values) => `0x${selector}${Buffer.from(abiEncode(types, values)).toString('hex')}`
const ids = (alerts) => alerts.map(({ id }) => id)

function makeContext ({ contracts = [TOKEN, SPENDER], known = [FRIEND], tokens = [] } = {}) {
  const codeAt = new Set(contracts.map((a) => a.toLowerCase()))
  return {
    getCode: async (address) => (codeAt.has(address.toLowerCase()) ? '0x6080' : '0x'),
    ownAccounts: new Set([OWN]),
    knownAddresses: new Set(known.map((a) => a.toLowerCase())),
    tokenContracts: new Set(tokens.map((a) => a.toLowerCase())),
  }
}

describe('On-device security checks', function () {
  describe('decodeCall', function () {
    it('reads recipients and spenders from transfer and approval calls', function () {
      assert.equal(decodeCall(encode('a9059cbb', ['address', 'uint256'], [STRANGER, 1])).recipient, STRANGER)
      assert.equal(decodeCall(encode('23b872dd', ['address', 'address', 'uint256'], [OWN, STRANGER, 1])).recipient, STRANGER)
      const approve = decodeCall(encode('095ea7b3', ['address', 'uint256'], [SPENDER, MAX]))
      assert.equal(approve.kind, 'approve')
      assert.equal(approve.spender, SPENDER)
      assert.equal(decodeCall(encode('a22cb465', ['address', 'bool'], [SPENDER, true])).approved, true)
      assert.equal(decodeCall('0xdeadbeef'), undefined)
      assert.equal(decodeCall('0xa9059cbb1234'), undefined)
    })
  })

  it('matches look-alike addresses by their visible start and end', function () {
    assert.equal(isLookalike(LOOKALIKE, FRIEND), true)
    assert.equal(isLookalike(FRIEND, FRIEND), false)
    assert.equal(isLookalike(STRANGER, FRIEND), false)
  })

  describe('transactions', function () {
    it('flags burn addresses', async function () {
      const alerts = await getTransactionAlerts({ txParams: { to: '0x000000000000000000000000000000000000dEaD' }, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertBurnAddress'])
    })

    it('flags a look-alike of a known address instead of calling it new', async function () {
      const alerts = await getTransactionAlerts({ txParams: { to: LOOKALIKE }, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertLookalikeAddress'])
      assert.equal(alerts[0].severity, 'danger')
      assert.equal(alerts[0].args[0].toLowerCase(), FRIEND)
    })

    it('notes first-time recipients, but not contacts or the user\'s own accounts', async function () {
      assert.deepEqual(ids(await getTransactionAlerts({ txParams: { to: STRANGER }, ...makeContext() })), ['alertFirstTimeRecipient'])
      assert.deepEqual(await getTransactionAlerts({ txParams: { to: FRIEND }, ...makeContext() }), [])
      assert.deepEqual(await getTransactionAlerts({ txParams: { to: OWN }, ...makeContext() }), [])
    })

    it('checks the token recipient, not the token contract, for transfers', async function () {
      const alerts = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('a9059cbb', ['address', 'uint256'], [LOOKALIKE, 5]) }, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertLookalikeAddress'])
      const toContract = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('a9059cbb', ['address', 'uint256'], [TOKEN, 5]) }, ...makeContext() })
      assert.deepEqual(ids(toContract), ['alertRecipientIsTokenContract'])
    })

    it('flags sending funds to a tracked token contract', async function () {
      const alerts = await getTransactionAlerts({ txParams: { to: TOKEN }, ...makeContext({ tokens: [TOKEN], known: [TOKEN] }) })
      assert.deepEqual(ids(alerts), ['alertRecipientIsKnownToken'])
    })

    it('flags contract data sent to an address without code', async function () {
      const alerts = await getTransactionAlerts({ txParams: { to: STRANGER, data: '0x12345678' }, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertDataToNonContract'])
    })

    it('flags unlimited approvals and spenders that are not contracts, but not revocations', async function () {
      const unlimited = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('095ea7b3', ['address', 'uint256'], [SPENDER, MAX]) }, ...makeContext() })
      assert.deepEqual(ids(unlimited), ['alertUnlimitedApproval'])
      const toAccount = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('095ea7b3', ['address', 'uint256'], [STRANGER, 10]) }, ...makeContext() })
      assert.deepEqual(ids(toAccount), ['alertSpenderNotContract'])
      const revoke = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('095ea7b3', ['address', 'uint256'], [STRANGER, 0]) }, ...makeContext() })
      assert.deepEqual(revoke, [])
    })

    it('flags approving a whole NFT collection', async function () {
      const alerts = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('a22cb465', ['address', 'bool'], [STRANGER, true]) }, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertApproveAllNfts', 'alertSpenderNotContract'])
      const revoke = await getTransactionAlerts({ txParams: { to: TOKEN, data: encode('a22cb465', ['address', 'bool'], [STRANGER, false]) }, ...makeContext() })
      assert.deepEqual(revoke, [])
    })

    it('reports when the RPC cannot be reached instead of failing', async function () {
      const alerts = await getTransactionAlerts({
        txParams: { to: TOKEN, data: encode('095ea7b3', ['address', 'uint256'], [SPENDER, 1]) },
        ...makeContext(),
        getCode: async () => {
          throw new Error('offline')
        },
      })
      assert.deepEqual(ids(alerts), ['alertCodeCheckFailed', 'alertCodeCheckFailed'])
    })
  })

  describe('typed data', function () {
    const now = Date.UTC(2026, 9, 1)
    const soon = Math.floor(now / 1000) + 3600
    const permit = (message, primaryType = 'Permit') => JSON.stringify({ primaryType, domain: {}, types: {}, message })

    it('decodes EIP-2612, DAI and Permit2 permits', function () {
      assert.equal(decodePermit({ primaryType: 'Permit', message: { spender: SPENDER, value: '5', deadline: soon } }).amounts[0].toString(), '5')
      assert.equal(decodePermit({ primaryType: 'Permit', message: { spender: SPENDER, allowed: true, expiry: 0 } }).unlimited, true)
      const single = decodePermit({ primaryType: 'PermitSingle', message: { spender: SPENDER, sigDeadline: soon, details: { token: TOKEN, amount: '7', expiration: soon + 5 } } })
      assert.equal(single.amounts[0].toString(), '7')
      assert.equal(single.expiry.toNumber(), soon + 5)
      assert.equal(decodePermit({ primaryType: 'Mail', message: { spender: SPENDER } }), undefined)
    })

    it('explains a short, limited permit to a contract', async function () {
      const alerts = await getTypedDataAlerts({ data: permit({ owner: OWN, spender: SPENDER, value: '5', nonce: 0, deadline: soon }), now, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertPermitSignature'])
    })

    it('flags unlimited, long-lived permits to ordinary accounts', async function () {
      const alerts = await getTypedDataAlerts({ data: permit({ spender: STRANGER, value: MAX, deadline: MAX }), now, ...makeContext() })
      assert.deepEqual(ids(alerts), ['alertSpenderNotContract', 'alertPermitSignature', 'alertUnlimitedApproval', 'alertLongLivedPermit'])
      const dai = await getTypedDataAlerts({ data: permit({ holder: OWN, spender: SPENDER, nonce: 0, expiry: 0, allowed: true }), now, ...makeContext() })
      assert.deepEqual(ids(dai), ['alertPermitSignature', 'alertUnlimitedApproval', 'alertLongLivedPermit'])
    })

    it('ignores revocations, other messages and malformed data', async function () {
      assert.deepEqual(await getTypedDataAlerts({ data: permit({ spender: SPENDER, allowed: false, expiry: 0 }), now, ...makeContext() }), [])
      assert.deepEqual(await getTypedDataAlerts({ data: permit({ contents: 'hi' }, 'Mail'), now, ...makeContext() }), [])
      assert.deepEqual(await getTypedDataAlerts({ data: '{not json', now, ...makeContext() }), [])
    })
  })
})
