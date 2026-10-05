import { rpcErrors } from '@metamask/rpc-errors';

import { BUILT_IN_NETWORKS, BUILT_IN_NETWORK_TYPES } from './enums';

// Chain IDs larger than this cannot be represented in all Ethereum tooling.
export const MAX_SAFE_CHAIN_ID = 4503599627370476;

/**
 * Well-known networks that are not built in, used only to warn when a site
 * describes one of them with a different currency. Nothing here is fetched
 * from the network.
 */
export const KNOWN_CHAINS = {
  '0x64': { name: 'Gnosis', symbols: ['XDAI', 'xDAI'] },
  '0xfa': { name: 'Fantom', symbols: ['FTM', 'S'] },
  '0xa4ba': { name: 'Arbitrum Nova', symbols: ['ETH'] },
  '0x82750': { name: 'Scroll', symbols: ['ETH'] },
  '0x4268': { name: 'Holesky', symbols: ['ETH'] },
  '0x13882': { name: 'Polygon Amoy', symbols: ['POL', 'MATIC'] },
  '0x14a34': { name: 'Base Sepolia', symbols: ['ETH'] },
  '0x66eee': { name: 'Arbitrum Sepolia', symbols: ['ETH'] },
  '0xaa37dc': { name: 'OP Sepolia', symbols: ['ETH'] },
};

/**
 * Converts a hex ("0x89") or decimal ("137") chain ID to minimal lower-case hex.
 *
 * @param {string|number} value - The chain ID.
 * @returns {string|undefined} The hex chain ID, or undefined if it is not valid.
 */
export function normalizeChainId(value) {
  let id;
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    id = value;
  } else if (typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value)) {
    id = parseInt(value, 16);
  } else if (typeof value === 'string' && /^[0-9]+$/u.test(value)) {
    id = parseInt(value, 10);
  } else {
    return undefined;
  }
  return id > 0 && id <= MAX_SAFE_CHAIN_ID ? `0x${id.toString(16)}` : undefined;
}

/**
 * Finds the built-in network type for a chain ID.
 *
 * @param {string} chainId - A hex chain ID.
 * @returns {string|undefined} The built-in provider type for the chain, if any.
 */
export function getBuiltInNetworkType(chainId) {
  return BUILT_IN_NETWORK_TYPES.find(
    (type) => BUILT_IN_NETWORKS[type].chainId === chainId,
  );
}

export function getBuiltInNetworkName(type) {
  return BUILT_IN_NETWORKS[type].name;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Parses a URL a site supplied, allowing only HTTPS (or HTTP to this computer)
 * and no embedded credentials.
 *
 * @param {string} value - The URL.
 * @param {boolean} allowLocalHttp - Whether http://localhost is acceptable.
 * @returns {URL|undefined} The parsed URL, if acceptable.
 */
export function parseSafeUrl(value, allowLocalHttp) {
  if (typeof value !== 'string' || value.length > 2048) {
    return undefined;
  }
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    return undefined;
  }
  if (url.username || url.password) {
    return undefined;
  }
  const isLocal = LOCAL_HOSTNAMES.has(url.hostname);
  if (
    url.protocol === 'https:' ||
    (allowLocalHttp && url.protocol === 'http:' && isLocal)
  ) {
    return url;
  }
  return undefined;
}

// Names are shown in the UI; refuse control and bidirectional override characters.
const UNSAFE_TEXT =
  // eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this pattern
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

function invalid(message) {
  return rpcErrors.invalidParams({ message });
}

function readSingleParam(params, method) {
  if (
    !Array.isArray(params) ||
    params.length !== 1 ||
    !params[0] ||
    typeof params[0] !== 'object' ||
    Array.isArray(params[0])
  ) {
    throw invalid(`Expected a single object parameter for ${method}.`);
  }
  return params[0];
}

function readChainId(value) {
  const chainId =
    typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value)
      ? normalizeChainId(value)
      : undefined;
  if (!chainId || chainId !== value.toLowerCase()) {
    throw invalid(
      `Invalid chainId "${value}". Expected a hexadecimal number without leading zeros, at most ${MAX_SAFE_CHAIN_ID}.`,
    );
  }
  return chainId;
}

/**
 * Validates wallet_switchEthereumChain params (EIP-3326).
 *
 * @param {unknown} params - The JSON-RPC request params; must be an array
 * holding a single object.
 * @returns {string} The requested hex chain ID.
 */
export function validateSwitchChainParams(params) {
  const param = readSingleParam(params, 'wallet_switchEthereumChain');
  const extraKeys = Object.keys(param).filter((key) => key !== 'chainId');
  if (extraKeys.length) {
    throw invalid(
      `Unsupported fields in the parameter object: ${extraKeys.join(', ')}`,
    );
  }
  return readChainId(param.chainId);
}

const ADD_CHAIN_KEYS = new Set([
  'chainId',
  'chainName',
  'rpcUrls',
  'nativeCurrency',
  'blockExplorerUrls',
  'iconUrls',
]);

/**
 * Validates wallet_addEthereumChain params (EIP-3085).
 *
 * @param {unknown} params - The JSON-RPC request params; must be an array
 * holding a single object.
 * @returns {object} The network the site described.
 */
export function validateAddChainParams(params) {
  const param = readSingleParam(params, 'wallet_addEthereumChain');
  const extraKeys = Object.keys(param).filter(
    (key) => !ADD_CHAIN_KEYS.has(key),
  );
  if (extraKeys.length) {
    throw invalid(
      `Unsupported fields in the parameter object: ${extraKeys.join(', ')}`,
    );
  }
  const chainId = readChainId(param.chainId);

  const chainName =
    typeof param.chainName === 'string' ? param.chainName.trim() : '';
  if (!chainName || chainName.length > 64 || UNSAFE_TEXT.test(chainName)) {
    throw invalid(
      'Expected chainName to be a non-empty string of at most 64 printable characters.',
    );
  }

  if (!Array.isArray(param.rpcUrls) || param.rpcUrls.length === 0) {
    throw invalid('Expected rpcUrls to be a non-empty array.');
  }
  const rpcUrl = parseSafeUrl(param.rpcUrls[0], true);
  if (!rpcUrl) {
    throw invalid(
      `Expected the first rpcUrls entry to be an https URL, or http://localhost. Received: ${String(param.rpcUrls[0]).slice(0, 200)}`,
    );
  }

  let blockExplorerUrl;
  if (
    param.blockExplorerUrls !== undefined &&
    param.blockExplorerUrls !== null
  ) {
    if (!Array.isArray(param.blockExplorerUrls)) {
      throw invalid('Expected blockExplorerUrls to be an array.');
    }
    if (param.blockExplorerUrls.length) {
      blockExplorerUrl = parseSafeUrl(param.blockExplorerUrls[0], false);
      if (!blockExplorerUrl) {
        throw invalid(
          'Expected the first blockExplorerUrls entry to be an https URL.',
        );
      }
    }
  }

  const { nativeCurrency } = param;
  let ticker = 'ETH';
  if (nativeCurrency !== undefined && nativeCurrency !== null) {
    if (typeof nativeCurrency !== 'object' || Array.isArray(nativeCurrency)) {
      throw invalid('Expected nativeCurrency to be an object.');
    }
    if (nativeCurrency.decimals !== 18) {
      throw invalid('Expected nativeCurrency.decimals to be 18.');
    }
    ticker =
      typeof nativeCurrency.symbol === 'string'
        ? nativeCurrency.symbol.trim()
        : '';
    if (!/^[\p{L}\p{N}.$_-]{1,6}$/u.test(ticker)) {
      throw invalid(
        'Expected nativeCurrency.symbol to be 1 to 6 letters or digits.',
      );
    }
  }

  return {
    chainId,
    chainName,
    rpcUrl: rpcUrl.href,
    ticker,
    blockExplorerUrl: blockExplorerUrl?.href,
  };
}

/**
 * Warnings shown with a request to add a network. Each is an i18n key and its
 * substitutions.
 *
 * @param {object} options0 - The validated network to add.
 * @param {string} options0.chainId - The hex chain ID.
 * @param {string} options0.ticker - The native currency symbol.
 * @param {string} options0.rpcUrl - The RPC URL.
 * @param {object} [existing] - An already-configured network with the same
 * chain ID, if any.
 * @returns {Array<[string, string[]]>} The warnings, as i18n key and
 * substitutions pairs.
 */
export function getAddChainWarnings({ chainId, ticker, rpcUrl }, existing) {
  const warnings = [['networkRequestRpcNotice', []]];
  const known = KNOWN_CHAINS[chainId];
  if (!known) {
    warnings.push(['networkRequestUnknownChain', []]);
  } else if (!known.symbols.includes(ticker)) {
    warnings.push([
      'networkRequestSymbolMismatch',
      [known.name, known.symbols[0], ticker],
    ]);
  }
  if (new URL(rpcUrl).protocol === 'http:') {
    warnings.push(['networkRequestInsecureRpc', []]);
  }
  if (existing && existing.rpcUrl !== rpcUrl) {
    warnings.push(['networkRequestDifferentRpc', [existing.rpcUrl]]);
  }
  return warnings;
}
