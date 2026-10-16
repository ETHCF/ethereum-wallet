import { ens_normalize as ensNormalize } from '@adraffy/ens-normalize';
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from '@ethereumjs/util';
import { decode, encode } from '@metamask/abi-utils';
import { getUniqueId } from '@metamask/json-rpc-engine';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3.js';

import { fetchOffchainData, offchainLookupFailed } from './ccip-read';
import { ENS_REGISTRIES, getNetworkEnsSupport } from './networks';
import { encodeCall } from '../../lib/contract-call';
import { UNSAFE_TEXT } from '../network/chain-utils';

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';

// ENSIP-10: resolve(bytes name, bytes data), for wildcard resolution.
const EXTENDED_RESOLVER_INTERFACE = '0x9061b923';
// EIP-3668: OffchainLookup(address,string[],bytes,bytes4,bytes).
const OFFCHAIN_LOOKUP_SELECTOR = '0x556f1830';
const OFFCHAIN_LOOKUP_DATA = /^0x556f1830(?:[0-9a-f]{2})*$/iu;
// EIP-3668 suggests a limit on chained lookups; it recommends at least four.
const MAX_OFFCHAIN_LOOKUPS = 4;
// Bounds the registry calls made looking for a wildcard resolver.
const MAX_LABELS = 32;

// Callers match on these messages and codes.
const notFound = () =>
  Object.assign(new Error('ENS name not defined.'), { code: 'notFound' });
const badRecord = () =>
  Object.assign(new Error('ENS record could not be read.'), {
    code: 'badRecord',
  });
const invalidName = (reason) =>
  Object.assign(new Error(`Illegal Character for ENS. ${reason ?? ''}`), {
    code: 'invalidName',
  });

/**
 * Normalizes an ENS name as ENSIP-15 describes, refusing names with
 * disallowed or confusable characters (such as a Latin name with one Cyrillic
 * letter) and names with characters that could disguise how they display.
 *
 * @param {string} name - A name, as typed or as read from a contract
 * @returns {string} The normalized name
 * @throws {Error} With the code 'invalidName'
 */
export function normalizeEnsName(name) {
  if (typeof name !== 'string') {
    throw invalidName();
  }
  let normalized;
  try {
    normalized = ensNormalize(name);
  } catch (error) {
    throw invalidName(error.message);
  }
  // ENSIP-15 only keeps a zero-width joiner inside an emoji sequence, where it
  // joins the emoji instead of hiding anything.
  if (!normalized || UNSAFE_TEXT.test(normalized.replace(/\u200d/gu, ''))) {
    throw invalidName();
  }
  return normalized;
}

/**
 * Computes the ENS namehash of a normalized name.
 *
 * @param {string} name - A normalized name
 * @returns {string} The node, as 0x-prefixed hex
 */
export function namehash(name) {
  let node = new Uint8Array(32);
  if (name) {
    for (const label of name.split('.').reverse()) {
      node = keccak256(concatBytes(node, keccak256(utf8ToBytes(label))));
    }
  }
  return bytesToHex(node);
}

/**
 * Encodes a normalized name in DNS wire format, as ENSIP-10 resolve() takes it.
 *
 * @param {string} name - A normalized name
 * @returns {Uint8Array} The encoded name
 */
export function dnsEncode(name) {
  const parts = [];
  for (const label of name.split('.')) {
    const bytes = utf8ToBytes(label);
    if (!bytes.length || bytes.length > 255) {
      throw invalidName('label length');
    }
    parts.push(Uint8Array.of(bytes.length), bytes);
  }
  parts.push(Uint8Array.of(0));
  return concatBytes(...parts);
}

function decodeResult(types, hex) {
  // An empty answer: no contract, or no record.
  if (!hex || hex === '0x') {
    throw notFound();
  }
  let values;
  try {
    values = decode(types, hexToBytes(hex));
  } catch (_) {
    throw badRecord();
  }
  return values.map((value) =>
    value instanceof Uint8Array ? bytesToHex(value) : value,
  );
}

/**
 * Finds the OffchainLookup revert data in an eth_call error. Middleware and
 * the RPC endpoint wrap it differently, so each nested data field is checked.
 *
 * @param {unknown} error - The error eth_call failed with
 * @returns {string | undefined} The revert data, as lowercase hex
 */
export function findOffchainLookup(error) {
  const seen = new Set();
  let level = [error];
  for (let depth = 0; depth < 6 && level.length; depth++) {
    const next = [];
    for (const value of level) {
      if (typeof value === 'string') {
        if (OFFCHAIN_LOOKUP_DATA.test(value)) {
          return value.toLowerCase();
        }
      } else if (value && typeof value === 'object' && !seen.has(value)) {
        seen.add(value);
        next.push(value.data, value.error, value.cause, value.originalError);
      }
    }
    level = next;
  }
  return undefined;
}

export default class Ens {
  static getNetworkEnsSupport(network) {
    return getNetworkEnsSupport(network);
  }

  /**
   * Creates an ENS client for one network.
   *
   * @param {object} options - Options
   * @param {string} options.network - The network ID
   * @param {object} options.provider - The wallet's provider for that network
   * @param {Function} [options.fetchOffchainData] - Asks CCIP-read gateways
   * for an answer (see ccip-read.js)
   */
  constructor({ network, provider, fetchOffchainData: fetchData } = {}) {
    if (!provider) {
      throw new Error('The Ens constructor requires a provider.');
    }
    this._provider = provider;
    this._fetchOffchainData = fetchData ?? fetchOffchainData;
    this._registryAddress = getNetworkEnsSupport(network)
      ? ENS_REGISTRIES[network]
      : undefined;
    if (!this._registryAddress) {
      throw new Error(`ENS is not supported on network ${network}.`);
    }
  }

  /**
   * Resolves an ENS name to an address, through a wildcard (ENSIP-10)
   * resolver on a parent name if the name has none of its own.
   *
   * @param {string} ensName - A name, such as 'vitalik.eth'
   * @param {object} [options] - Options
   * @param {boolean} [options.allowOffchain] - Whether the resolver may send
   * the wallet to a CCIP-read (EIP-3668) gateway for the answer. Without it,
   * a name stored offchain fails to resolve.
   * @returns {Promise<string>} The address it resolves to
   */
  async lookup(ensName = '', { allowOffchain = false } = {}) {
    const name = normalizeEnsName(ensName);
    const [address] = await this._resolveRecord(
      name,
      'addr(bytes32)',
      ['address'],
      { allowOffchain },
    );
    return address;
  }

  /**
   * Performs a reverse lookup of the name an address claims for itself. The
   * name is as the contract gives it: the caller normalizes it and checks it
   * resolves back to the address.
   *
   * @param {string} address - An account address
   * @returns {Promise<string>} The name the address claims for itself
   */
  async reverse(address) {
    if (!address) {
      throw new Error('Must supply an address to reverse lookup.');
    }
    const [name] = await this._resolveRecord(
      `${address.replace(/^0x/u, '').toLowerCase()}.addr.reverse`,
      'name(bytes32)',
      ['string'],
      { allowOffchain: false },
    );
    return name;
  }

  async _resolveRecord(name, signature, outputTypes, { allowOffchain }) {
    const { resolver, exact } = await this._findResolver(name);
    const call = encodeCall(signature, [hexToBytes(namehash(name))]);
    if (await this._supportsWildcard(resolver)) {
      const [answer] = decodeResult(
        ['bytes'],
        await this._callWithOffchainLookup(
          resolver,
          encodeCall('resolve(bytes,bytes)', [
            dnsEncode(name),
            hexToBytes(call),
          ]),
          allowOffchain,
        ),
      );
      return decodeResult(outputTypes, answer);
    }
    // A parent's resolver answers for a subname only through resolve().
    if (!exact) {
      throw notFound();
    }
    return decodeResult(
      outputTypes,
      await this._callWithOffchainLookup(resolver, call, allowOffchain),
    );
  }

  // ENSIP-10: the resolver of the name, or else of its closest parent.
  async _findResolver(name, depth = 0) {
    if (!name || depth >= MAX_LABELS) {
      throw notFound();
    }
    const [resolver] = decodeResult(
      ['address'],
      await this._call(
        this._registryAddress,
        encodeCall('resolver(bytes32)', [hexToBytes(namehash(name))]),
      ),
    );
    if (resolver !== EMPTY_ADDRESS) {
      return { resolver, exact: depth === 0 };
    }
    const dot = name.indexOf('.');
    // The root's resolver is not used for names under it.
    if (dot === -1) {
      throw notFound();
    }
    return this._findResolver(name.slice(dot + 1), depth + 1);
  }

  async _supportsWildcard(resolver) {
    try {
      const [supported] = decodeResult(
        ['bool'],
        await this._call(
          resolver,
          encodeCall('supportsInterface(bytes4)', [
            hexToBytes(EXTENDED_RESOLVER_INTERFACE),
          ]),
        ),
      );
      return supported === true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Makes an eth_call, following the contract to a CCIP-read gateway and back
   * when it reverts with OffchainLookup (EIP-3668).
   *
   * @param {string} to - The contract
   * @param {string} data - The call data
   * @param {boolean} allowOffchain - Whether gateways may be contacted
   * @param {number} [lookups] - The offchain lookups made so far
   * @returns {Promise<string>} The call's result
   */
  async _callWithOffchainLookup(to, data, allowOffchain, lookups = 0) {
    let revert;
    try {
      return await this._call(to, data);
    } catch (error) {
      revert = findOffchainLookup(error);
      if (!revert) {
        throw error;
      }
    }
    if (!allowOffchain) {
      throw offchainLookupFailed('offchain lookups are not allowed here');
    }
    if (lookups >= MAX_OFFCHAIN_LOOKUPS) {
      throw offchainLookupFailed('too many lookups');
    }
    let sender, urls, callData, callbackFunction, extraData;
    try {
      [sender, urls, callData, callbackFunction, extraData] = decode(
        ['address', 'string[]', 'bytes', 'bytes4', 'bytes'],
        hexToBytes(`0x${revert.slice(OFFCHAIN_LOOKUP_SELECTOR.length)}`),
      );
    } catch (_) {
      throw offchainLookupFailed('malformed OffchainLookup');
    }
    // EIP-3668: only the contract called may send the wallet offchain.
    if (sender.toLowerCase() !== to.toLowerCase()) {
      throw offchainLookupFailed('sender does not match the contract');
    }
    const response = await this._fetchOffchainData({
      urls,
      sender: sender.toLowerCase(),
      callData: bytesToHex(callData),
    });
    const callback = bytesToHex(
      concatBytes(
        callbackFunction,
        encode(['bytes', 'bytes'], [hexToBytes(response), extraData]),
      ),
    );
    return this._callWithOffchainLookup(
      to,
      callback,
      allowOffchain,
      lookups + 1,
    );
  }

  // The provider directly, rather than EthQuery, keeps revert data intact.
  _call(to, data) {
    return new Promise((resolve, reject) => {
      this._provider.sendAsync(
        {
          id: getUniqueId(),
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        },
        (error, response) => {
          const rpcError = error || response?.error;
          if (rpcError) {
            reject(rpcError);
          } else {
            resolve(response.result);
          }
        },
      );
    });
  }
}
