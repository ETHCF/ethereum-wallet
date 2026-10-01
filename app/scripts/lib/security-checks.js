import ethUtil from 'ethereumjs-util'
import BN from 'bn.js'
import { decodeArguments } from './abi-method-decoder'

// Every check here runs on this device, using data the wallet already has and
// the user's own RPC node. Nothing is sent to an outside analysis service.

export const SEVERITY = {
  DANGER: 'danger',
  WARNING: 'warning',
  INFO: 'info',
}

const BURN_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
])

// Amounts at or above 2^128 are far beyond any real token supply, so they
// amount to an unlimited allowance.
const UNLIMITED = new BN(2).pow(new BN(128))
// Permits valid for longer than this are flagged.
const LONG_LIVED_SECONDS = 30 * 24 * 60 * 60
const CODE_TIMEOUT_MS = 5000

// Function selector -> how to read the call.
const CALLS = {
  a9059cbb: { kind: 'tokenTransfer', types: ['address', 'uint256'], recipient: 0 },
  '23b872dd': { kind: 'tokenTransfer', types: ['address', 'address', 'uint256'], recipient: 1 },
  '42842e0e': { kind: 'tokenTransfer', types: ['address', 'address', 'uint256'], recipient: 1 },
  b88d4fde: { kind: 'tokenTransfer', types: ['address', 'address', 'uint256', 'bytes'], recipient: 1 },
  f242432a: { kind: 'tokenTransfer', types: ['address', 'address', 'uint256', 'uint256', 'bytes'], recipient: 1 },
  '2eb2c2d6': { kind: 'tokenTransfer', types: ['address', 'address', 'uint256[]', 'uint256[]', 'bytes'], recipient: 1 },
  '095ea7b3': { kind: 'approve', types: ['address', 'uint256'], spender: 0, amount: 1 },
  '39509351': { kind: 'approve', types: ['address', 'uint256'], spender: 0, amount: 1 },
  a22cb465: { kind: 'approveAll', types: ['address', 'bool'], spender: 0, approved: 1 },
  // Permit2 approve(token, spender, amount, expiration)
  '87517c45': { kind: 'approve', types: ['address', 'address', 'uint160', 'uint48'], spender: 1, amount: 2 },
}

function alert (id, severity, args = []) {
  return { id, severity, args }
}

const lower = (address) => (typeof address === 'string' ? address.toLowerCase() : undefined)
const checksum = (address) => ethUtil.toChecksumAddress(address)

/**
 * Decodes a call this module understands.
 *
 * @param {string} data - Transaction data.
 * @returns {Object|undefined} The call kind and its addresses and amounts.
 */
export function decodeCall (data) {
  if (typeof data !== 'string' || data.length < 10) {
    return undefined
  }
  const call = CALLS[data.slice(2, 10).toLowerCase()]
  const values = call && decodeArguments(call.types, data.slice(10))
  if (!values) {
    return undefined
  }
  const address = (index) => values[index]
  return {
    kind: call.kind,
    recipient: call.recipient === undefined ? undefined : address(call.recipient),
    spender: call.spender === undefined ? undefined : address(call.spender),
    amount: call.amount === undefined ? undefined : new BN(values[call.amount].toString(10)),
    approved: call.approved === undefined ? undefined : Boolean(values[call.approved]),
  }
}

/**
 * Whether `candidate` mimics `known`: same leading and trailing characters
 * (the parts wallets and explorers show), but a different address.
 */
export function isLookalike (candidate, known) {
  const a = lower(candidate)
  const b = lower(known)
  return Boolean(a && b) && a !== b && a.slice(2, 6) === b.slice(2, 6) && a.slice(-4) === b.slice(-4)
}

async function hasCode (getCode, address) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CODE_TIMEOUT_MS)
  })
  try {
    const code = await Promise.race([getCode(address), timeout])
    return Boolean(code) && code !== '0x' && code !== '0x0'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Checks the address funds are sent to.
 *
 * @param {Object} context
 * @param {string} context.recipient - The receiving address.
 * @param {Set<string>} context.ownAccounts - Lower-case addresses of the user's accounts.
 * @param {Set<string>} context.knownAddresses - Lower-case contacts and previous recipients.
 * @param {Set<string>} context.tokenContracts - Lower-case token contracts the user tracks.
 */
function checkRecipient ({ recipient, ownAccounts, knownAddresses, tokenContracts }) {
  const address = lower(recipient)
  if (BURN_ADDRESSES.has(address)) {
    return [alert('alertBurnAddress', SEVERITY.DANGER)]
  }
  if (ownAccounts.has(address)) {
    return []
  }
  const alerts = []
  if (tokenContracts.has(address)) {
    alerts.push(alert('alertRecipientIsKnownToken', SEVERITY.DANGER))
  }
  const familiar = [...ownAccounts, ...knownAddresses].find((known) => isLookalike(address, known))
  if (familiar) {
    alerts.push(alert('alertLookalikeAddress', SEVERITY.DANGER, [checksum(familiar)]))
  } else if (!knownAddresses.has(address)) {
    alerts.push(alert('alertFirstTimeRecipient', SEVERITY.INFO))
  }
  return alerts
}

/**
 * Checks an address that is being given permission to spend the user's assets.
 */
async function checkSpender ({ spender, getCode, ownAccounts }) {
  if (ownAccounts.has(lower(spender))) {
    return []
  }
  try {
    if (!(await hasCode(getCode, spender))) {
      return [alert('alertSpenderNotContract', SEVERITY.DANGER, [checksum(spender)])]
    }
    return []
  } catch (_) {
    return [alert('alertCodeCheckFailed', SEVERITY.INFO, [checksum(spender)])]
  }
}

function sortAlerts (alerts) {
  const order = [SEVERITY.DANGER, SEVERITY.WARNING, SEVERITY.INFO]
  return alerts.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
}

/**
 * Checks a transaction before it is shown for confirmation.
 *
 * @param {Object} options
 * @param {Object} options.txParams - The transaction.
 * @param {Function} options.getCode - Returns the code at an address, via the user's RPC.
 * @param {Set<string>} options.ownAccounts - Lower-case addresses of the user's accounts.
 * @param {Set<string>} options.knownAddresses - Lower-case contacts and previous recipients.
 * @param {Set<string>} options.tokenContracts - Lower-case token contracts the user tracks.
 * @returns {Promise<Object[]>} Alerts, most severe first.
 */
export async function getTransactionAlerts ({ txParams, getCode, ownAccounts, knownAddresses, tokenContracts }) {
  const { to, data } = txParams
  if (!to) {
    return []
  }
  const hasData = typeof data === 'string' && data !== '0x' && data !== ''
  const call = hasData ? decodeCall(data) : undefined
  const context = { getCode, ownAccounts, knownAddresses, tokenContracts }
  const alerts = []

  if (!hasData) {
    alerts.push(...checkRecipient({ ...context, recipient: to }))
    return sortAlerts(alerts)
  }

  try {
    if (!(await hasCode(getCode, to))) {
      alerts.push(alert('alertDataToNonContract', SEVERITY.WARNING, [checksum(to)]))
    }
  } catch (_) {
    alerts.push(alert('alertCodeCheckFailed', SEVERITY.INFO, [checksum(to)]))
  }

  if (call?.kind === 'tokenTransfer') {
    if (lower(call.recipient) === lower(to)) {
      alerts.push(alert('alertRecipientIsTokenContract', SEVERITY.DANGER))
    } else {
      alerts.push(...checkRecipient({ ...context, recipient: call.recipient }))
    }
  } else if (call?.kind === 'approve' && !call.amount.isZero()) {
    if (call.amount.gte(UNLIMITED)) {
      alerts.push(alert('alertUnlimitedApproval', SEVERITY.WARNING, [checksum(call.spender)]))
    }
    alerts.push(...await checkSpender({ ...context, spender: call.spender }))
  } else if (call?.kind === 'approveAll' && call.approved) {
    alerts.push(alert('alertApproveAllNfts', SEVERITY.DANGER, [checksum(call.spender)]))
    alerts.push(...await checkSpender({ ...context, spender: call.spender }))
  }
  return sortAlerts(alerts)
}

function toBN (value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return new BN(value)
  }
  if (typeof value === 'string' && (/^0x[0-9a-f]+$/iu).test(value)) {
    return new BN(value.slice(2), 16)
  }
  if (typeof value === 'string' && (/^[0-9]+$/u).test(value)) {
    return new BN(value, 10)
  }
  return undefined
}

const isAddress = (value) => typeof value === 'string' && ethUtil.isValidAddress(value)

/**
 * Reads token spending permissions out of typed data: EIP-2612 and DAI
 * permits, and Uniswap Permit2 approvals and transfers.
 *
 * @returns {Object|undefined} The spender, amounts and expiry, if this is a permit.
 */
export function decodePermit (typedData) {
  const { primaryType, message } = typedData || {}
  if (!message || typeof message !== 'object' || !isAddress(message.spender)) {
    return undefined
  }
  const { spender } = message
  switch (primaryType) {
    case 'Permit':
      if ('allowed' in message) {
        // DAI-style: all or nothing; expiry 0 never expires.
        return { spender, unlimited: message.allowed === true, expiry: toBN(message.expiry), revokes: message.allowed === false }
      }
      return { spender, amounts: [toBN(message.value)], expiry: toBN(message.deadline) }
    case 'PermitSingle':
    case 'PermitBatch': {
      const details = [].concat(message.details || [])
      return {
        spender,
        amounts: details.map((detail) => toBN(detail?.amount)),
        expiry: [toBN(message.sigDeadline), ...details.map((detail) => toBN(detail?.expiration))]
          .reduce((latest, value) => (value && (!latest || value.gt(latest)) ? value : latest), undefined),
      }
    }
    case 'PermitTransferFrom':
    case 'PermitBatchTransferFrom':
    case 'PermitWitnessTransferFrom':
    case 'PermitBatchWitnessTransferFrom':
      return {
        spender,
        amounts: [].concat(message.permitted || []).map((permitted) => toBN(permitted?.amount)),
        expiry: toBN(message.deadline),
      }
    default:
      return undefined
  }
}

/**
 * Checks typed data before it is shown for signing.
 *
 * @param {Object} options
 * @param {string} options.data - The typed data as JSON.
 * @param {Function} options.getCode - Returns the code at an address, via the user's RPC.
 * @param {Set<string>} options.ownAccounts - Lower-case addresses of the user's accounts.
 * @param {number} [options.now] - The current time in milliseconds.
 * @returns {Promise<Object[]>} Alerts, most severe first.
 */
export async function getTypedDataAlerts ({ data, getCode, ownAccounts, now = Date.now() }) {
  let permit
  try {
    permit = decodePermit(typeof data === 'string' ? JSON.parse(data) : data)
  } catch (_) {
    return []
  }
  if (!permit || permit.revokes) {
    return []
  }
  const spender = checksum(permit.spender)
  const alerts = [alert('alertPermitSignature', SEVERITY.WARNING, [spender])]
  if (permit.unlimited || (permit.amounts || []).some((amount) => !amount || amount.gte(UNLIMITED))) {
    alerts.push(alert('alertUnlimitedApproval', SEVERITY.WARNING, [spender]))
  }
  const nowSeconds = new BN(Math.floor(now / 1000))
  if (!permit.expiry || permit.expiry.isZero() || permit.expiry.gt(nowSeconds.addn(LONG_LIVED_SECONDS))) {
    alerts.push(alert('alertLongLivedPermit', SEVERITY.WARNING))
  }
  alerts.push(...await checkSpender({ spender: permit.spender, getCode, ownAccounts }))
  return sortAlerts(alerts)
}
