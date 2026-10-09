import { stripHexPrefix } from '@ethereumjs/util';
import BN from 'bn.js';

import { decodeArguments } from './abi-method-decoder';
import { encodeCall } from './contract-call';

/**
 * Reads balances from a deployed single-call balance checker contract.
 * Results are ordered by user, then token: index = userIndex * tokens.length + tokenIndex.
 *
 * @param {object} query - A promisified EthQuery
 * @param {string} contractAddress - The balance checker contract address
 * @param {string[]} users - Addresses to check
 * @param {string[]} tokens - Token addresses; the zero address means ether
 * @returns {Promise<BN[]>} The balances
 */
export default async function getSingleCallBalances(
  query,
  contractAddress,
  users,
  tokens,
) {
  const result = await query.call(
    {
      to: contractAddress,
      data: encodeCall('balances(address[],address[])', [users, tokens]),
    },
    'latest',
  );
  const [balances = []] =
    decodeArguments(['uint256[]'], stripHexPrefix(result || '')) || [];
  if (balances.length !== users.length * tokens.length) {
    throw new Error(
      `Balance checker returned ${balances.length} balances, expected ${users.length * tokens.length}`,
    );
  }
  return balances.map((balance) => new BN(balance.toString(10)));
}
