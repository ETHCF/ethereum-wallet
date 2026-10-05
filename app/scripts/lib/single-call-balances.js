import { stripHexPrefix } from '@ethereumjs/util';
import { encode } from '@metamask/abi-utils';
import BN from 'bn.js';

import { decodeArguments, functionSelector } from './abi-method-decoder';

const BALANCES_SELECTOR = functionSelector('balances(address[],address[])');

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
  const args = Buffer.from(
    encode(['address[]', 'address[]'], [users, tokens]),
  ).toString('hex');
  const result = await query.call(
    { to: contractAddress, data: `0x${BALANCES_SELECTOR}${args}` },
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
