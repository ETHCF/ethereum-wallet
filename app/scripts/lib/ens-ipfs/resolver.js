import {
  decode as decodeContentHash,
  getCodec,
} from '@ensdomains/content-hash';
import EthQuery from '@metamask/eth-query';
import namehash from 'eth-ens-namehash';
import pify from 'pify';

import { callContract } from '../contract-call';

// @ensdomains/content-hash names codecs without the multicodec "-ns" suffix
// that the rest of the ENS code uses.
const CODEC_NAMES = { ipfs: 'ipfs-ns', ipns: 'ipns-ns', swarm: 'swarm-ns' };

export default async function resolveEnsToIpfsContentId({ provider, name }) {
  const query = pify(new EthQuery(provider));
  const hash = namehash.hash(name);
  // lookup registry
  const chainId = Number.parseInt(
    await query.sendAsync({ method: 'net_version' }),
    10,
  );
  const registryAddress = getRegistryForChainId(chainId);
  if (!registryAddress) {
    throw new Error(
      `EnsIpfsResolver - no known ens-ipfs registry for chainId "${chainId}"`,
    );
  }
  // lookup resolver
  const [resolverAddress] = await callContract(
    query,
    registryAddress,
    'resolver(bytes32)',
    ['address'],
    [hash],
  );
  if (hexValueIsEmpty(resolverAddress)) {
    throw new Error(`EnsIpfsResolver - no resolver found for name "${name}"`);
  }
  const supportsInterface = async (interfaceId) => {
    const [supported] = await callContract(
      query,
      resolverAddress,
      'supportsInterface(bytes4)',
      ['bool'],
      [interfaceId],
    );
    return supported;
  };

  if (await supportsInterface('0xbc1c58d1')) {
    const [rawContentHash] = await callContract(
      query,
      resolverAddress,
      'contenthash(bytes32)',
      ['bytes'],
      [hash],
    );
    const codec = getCodec(rawContentHash);
    // IPFS and IPNS come back as CIDv1 in base32 or base36, as gateway
    // subdomains need.
    return {
      type: CODEC_NAMES[codec] ?? codec,
      hash: decodeContentHash(rawContentHash),
    };
  }
  if (await supportsInterface('0xd8389dc5')) {
    // lookup content id
    const [content] = await callContract(
      query,
      resolverAddress,
      'content(bytes32)',
      ['bytes32'],
      [hash],
    );
    if (hexValueIsEmpty(content)) {
      throw new Error(
        `EnsIpfsResolver - no content ID found for name "${name}"`,
      );
    }
    return { type: 'swarm-ns', hash: content.slice(2) };
  }
  throw new Error(
    `EnsIpfsResolver - the resolver for name "${name}" is not standard, it should either supports contenthash() or content()`,
  );
}

function hexValueIsEmpty(value) {
  return [
    undefined,
    null,
    '0x',
    '0x0',
    '0x0000000000000000000000000000000000000000000000000000000000000000',
  ].includes(value);
}

/**
 * Returns the registry address for the given chain ID
 *
 * @param {number} chainId - the chain ID
 * @returns {string|null} the registry address if known, null otherwise
 */
function getRegistryForChainId(chainId) {
  switch (chainId) {
    case 1:
    case 11155111:
      // Mainnet and Sepolia use the same address
      return '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
    default:
      return null;
  }
}
