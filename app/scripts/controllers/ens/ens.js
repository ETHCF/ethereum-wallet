import EthQuery from '@metamask/eth-query';
import namehash from 'eth-ens-namehash';
import ensNetworkMap from 'ethereum-ens-network-map';
import pify from 'pify';

import { callContract } from '../../lib/contract-call';

const EMPTY_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';

// Callers match on these messages.
const notFound = () => new Error('ENS name not defined.');

export default class Ens {
  static getNetworkEnsSupport(network) {
    return Boolean(ensNetworkMap[network]);
  }

  constructor({ network, provider } = {}) {
    if (!provider) {
      throw new Error('The Ens constructor requires a provider.');
    }
    this._query = pify(new EthQuery(provider));
    this._registryAddress = ensNetworkMap[network];
    if (!this._registryAddress) {
      throw new Error(`ENS is not supported on network ${network}.`);
    }
  }

  /**
   * Resolves an ENS name to an address.
   *
   * @param {string} ensName - A name, such as 'vitalik.eth'
   * @returns {Promise<string>} The address it resolves to
   */
  async lookup(ensName = '') {
    const node = hashName(ensName);
    if (node === EMPTY_HASH) {
      throw notFound();
    }
    const [address] = await callContract(
      this._query,
      await this._resolverFor(node),
      'addr(bytes32)',
      ['address'],
      [node],
    );
    return address;
  }

  /**
   * Performs a reverse lookup of the name an address claims for itself.
   *
   * @param {string} address - An account address
   * @returns {Promise<string>} The name the address claims for itself
   */
  async reverse(address) {
    if (!address) {
      throw new Error('Must supply an address to reverse lookup.');
    }
    const node = hashName(
      `${address.replace(/^0x/u, '').toLowerCase()}.addr.reverse`,
    );
    const [name] = await callContract(
      this._query,
      await this._resolverFor(node),
      'name(bytes32)',
      ['string'],
      [node],
    );
    return name;
  }

  async _resolverFor(node) {
    const [resolver] = await callContract(
      this._query,
      this._registryAddress,
      'resolver(bytes32)',
      ['address'],
      [node],
    );
    if (resolver === EMPTY_ADDRESS) {
      throw notFound();
    }
    return resolver;
  }
}

function hashName(name) {
  try {
    return namehash.hash(name);
  } catch (_) {
    throw new Error('Illegal Character for ENS.');
  }
}
