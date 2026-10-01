import abi from 'ethereumjs-abi'
import { stripHexPrefix } from 'ethereumjs-util'

/**
 * Reads balances from a deployed single-call balance checker contract.
 * Results are ordered by user, then token: index = userIndex * tokens.length + tokenIndex.
 *
 * @param {Object} query - A promisified EthQuery
 * @param {string} contractAddress - The balance checker contract address
 * @param {string[]} users - Addresses to check
 * @param {string[]} tokens - Token addresses; the zero address means ether
 * @returns {Promise<BN[]>} The balances
 */
export default async function getSingleCallBalances (query, contractAddress, users, tokens) {
  const data = abi.simpleEncode('balances(address[],address[]):(uint256[])', users, tokens)
  const result = await query.call({ to: contractAddress, data: `0x${data.toString('hex')}` }, 'latest')
  const [balances] = abi.rawDecode(['uint256[]'], Buffer.from(stripHexPrefix(result || ''), 'hex'))
  if (balances.length !== users.length * tokens.length) {
    throw new Error(`Balance checker returned ${balances.length} balances, expected ${users.length * tokens.length}`)
  }
  return balances
}
