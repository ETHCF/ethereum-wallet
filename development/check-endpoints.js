#!/usr/bin/env node
/*
 * Asks every built-in RPC endpoint which chain it is on, and checks the answer
 * against what the wallet expects. This is deliberately not part of the test
 * suite: it depends on hosts nobody here controls, and a unit suite that can
 * fail because a third party is down is worse than no check at all. It runs on
 * a schedule instead, so a dead endpoint is noticed before a user finds it.
 *
 * Exits 0 when every endpoint answers correctly, 1 otherwise, and 0 with a
 * notice when the machine has no network at all.
 */

require('@babel/register')

const { BUILT_IN_NETWORKS } = require('../app/scripts/controllers/network/enums')

const TIMEOUT_MS = 15000

async function chainIdOf (url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const { result, error } = await response.json()
  if (error) {
    throw new Error(error.message || 'JSON-RPC error')
  }
  return result
}

async function online () {
  try {
    await fetch('https://example.com', { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUT_MS) })
    return true
  } catch (_) {
    return false
  }
}

async function main () {
  const targets = []
  for (const [name, config] of Object.entries(BUILT_IN_NETWORKS)) {
    for (const url of [config.rpcUrl, ...(config.fallbackRpcUrls || [])]) {
      targets.push({ name, url, expected: config.chainId })
    }
  }

  const failures = []
  for (const { name, url, expected } of targets) {
    try {
      const actual = await chainIdOf(url)
      if (BigInt(actual) === BigInt(expected)) {
        console.log(`  ok           ${name.padEnd(16)} ${url}`)
      } else {
        failures.push(`${name}: ${url} reports chain ${actual}, expected ${expected}`)
        console.log(`  WRONG CHAIN  ${name.padEnd(16)} ${url} -> ${actual}`)
      }
    } catch (error) {
      failures.push(`${name}: ${url} did not answer (${error.message})`)
      console.log(`  UNREACHABLE  ${name.padEnd(16)} ${url} -> ${error.message}`)
    }
  }

  console.log(`\n${targets.length - failures.length}/${targets.length} endpoints healthy`)
  if (!failures.length) {
    return
  }
  if (!(await online())) {
    console.log('No network from this machine; not treating the above as endpoint failures.')
    return
  }
  console.error(`\n${failures.length} endpoint(s) need attention:`)
  failures.forEach((f) => console.error(`  ${f}`))
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
