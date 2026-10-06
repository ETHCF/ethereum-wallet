import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { ObservableStore } from '@metamask/obs-store';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import EventEmitter from 'events';

import fetchWithTimeout from '../lib/fetch-with-timeout';
import createId from '../lib/random-id';
import {
  getAddChainWarnings,
  getBuiltInNetworkName,
  getBuiltInNetworkType,
  normalizeChainId,
  validateAddChainParams,
  validateSwitchChainParams,
} from './network/chain-utils';

export const ADD_CHAIN = 'wallet_addEthereumChain';
export const SWITCH_CHAIN = 'wallet_switchEthereumChain';
// EIP-3326: the chain has not been added to the wallet.
export const UNRECOGNIZED_CHAIN_ERROR_CODE = 4902;

// json-rpc-engine replaces error codes it does not know, such as 4902, with
// an internal error unless the error is an instance of its own error class.
function unrecognizedChainError(message) {
  return providerErrors.custom({
    code: UNRECOGNIZED_CHAIN_ERROR_CODE,
    message,
  });
}

const fetchRpc = fetchWithTimeout({ timeout: 10000 });

/**
 * Whether a URL points at the user's machine or private network. The wallet
 * contacts such an endpoint only after the user approves: before that, a site
 * could use the answers to learn which local ports and hosts respond.
 *
 * @param {string} rpcUrl - The endpoint.
 * @returns {boolean} Whether it is local or private.
 */
export function isPrivateRpcUrl(rpcUrl) {
  const hostname = new URL(rpcUrl).hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.startsWith('[')
  ) {
    return true;
  }
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Asks an RPC endpoint which chain it serves.
 *
 * @param {string} rpcUrl - The endpoint.
 * @returns {Promise<string|undefined>} Its hex chain ID, if it answered with one.
 */
export async function fetchRpcChainId(rpcUrl) {
  const response = await fetchRpc(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    }),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  const { result } = await response.json();
  return normalizeChainId(result);
}

/**
 * Handles requests from sites to add or switch networks. Every request needs
 * explicit approval, and each site may have only one pending at a time.
 */
export default class NetworkRequestController extends EventEmitter {
  constructor({
    getCurrentChainId,
    getCustomNetworks,
    addCustomNetwork,
    setCustomNetwork,
    setBuiltInNetwork,
    showApprovalRequest,
    getRpcChainId = fetchRpcChainId,
  }) {
    super();
    this.getCurrentChainId = getCurrentChainId;
    this.getCustomNetworks = getCustomNetworks;
    this.addCustomNetwork = addCustomNetwork;
    this.setCustomNetwork = setCustomNetwork;
    this.setBuiltInNetwork = setBuiltInNetwork;
    this.showApprovalRequest = showApprovalRequest;
    this.getRpcChainId = getRpcChainId;
    this.pending = new Map();
    // Sites whose request is being checked before it can be shown.
    this.checking = new Set();
    this.memStore = new ObservableStore({ pendingNetworkRequests: {} });
  }

  get pendingCount() {
    return this.pending.size;
  }

  createMiddleware({ origin }) {
    return createAsyncMiddleware(async (req, res, next) => {
      if (req.method === ADD_CHAIN) {
        res.result = await this.addChain(origin, req.params);
      } else if (req.method === SWITCH_CHAIN) {
        res.result = await this.switchChain(origin, req.params);
      } else {
        await next();
      }
    });
  }

  async addChain(origin, params) {
    const network = validateAddChainParams(params);
    const builtInType = getBuiltInNetworkType(network.chainId);
    if (builtInType) {
      // Built-in networks always use their own RPC provider.
      return this.requestSwitch(origin, network.chainId);
    }
    const existing = this.findCustomNetwork(network.chainId, network.rpcUrl);
    if (existing?.rpcUrl === network.rpcUrl) {
      return this.requestSwitch(origin, network.chainId);
    }

    this.assertNoPendingRequest(origin);
    const checkFirst = !isPrivateRpcUrl(network.rpcUrl);
    if (checkFirst) {
      // Hold the site's one slot while its endpoint is checked, or several
      // concurrent requests would all pass the check above.
      this.checking.add(origin);
      try {
        await this.assertServesChain(network);
      } finally {
        this.checking.delete(origin);
      }
    }
    return this.addRequest(origin, {
      type: 'add',
      network,
      warnings: getAddChainWarnings(network, existing),
      perform: async () => {
        if (!checkFirst) {
          await this.assertServesChain(network);
        }
        await this.addCustomNetwork(network);
      },
    });
  }

  /**
   * Throws unless the network's RPC endpoint serves its chain.
   *
   * @param {object} network - The network to add.
   */
  async assertServesChain(network) {
    let rpcChainId;
    try {
      rpcChainId = await this.getRpcChainId(network.rpcUrl);
    } catch (_) {
      throw rpcErrors.invalidParams({
        message: `Could not fetch the chain ID from ${network.rpcUrl}. Is the RPC URL correct?`,
      });
    }
    if (rpcChainId !== network.chainId) {
      throw rpcErrors.invalidParams({
        message: `The RPC endpoint returned a different chain ID (${rpcChainId}) than the one requested (${network.chainId}).`,
      });
    }
  }

  async switchChain(origin, params) {
    return this.requestSwitch(origin, validateSwitchChainParams(params));
  }

  async requestSwitch(origin, chainId) {
    if (this.getCurrentChainId() === chainId) {
      return null;
    }
    const builtInType = getBuiltInNetworkType(chainId);
    const custom = builtInType ? undefined : this.findCustomNetwork(chainId);
    if (!builtInType && !custom) {
      throw unrecognizedChainError(
        `Chain ${chainId} is not in this wallet. Call ${ADD_CHAIN} to add it before switching to it.`,
      );
    }
    this.assertNoPendingRequest(origin);
    return this.addRequest(origin, {
      type: 'switch',
      network: builtInType
        ? {
            chainId,
            chainName: getBuiltInNetworkName(builtInType),
            ticker: 'ETH',
          }
        : {
            chainId,
            chainName: custom.nickname || custom.rpcUrl,
            rpcUrl: custom.rpcUrl,
            ticker: custom.ticker || 'ETH',
          },
      warnings: [],
      perform: async () => {
        // The network list may have changed while the request was pending.
        if (builtInType) {
          await this.setBuiltInNetwork(builtInType);
          return;
        }
        const current = this.findCustomNetwork(chainId, custom.rpcUrl);
        if (current?.rpcUrl !== custom.rpcUrl) {
          throw unrecognizedChainError(
            `Chain ${chainId} was removed from this wallet while the request was waiting.`,
          );
        }
        await this.setCustomNetwork(current);
      },
    });
  }

  findCustomNetwork(chainId, preferredRpcUrl) {
    const matches = this.getCustomNetworks().filter(
      (network) => normalizeChainId(network.chainId) === chainId,
    );
    return (
      matches.find((network) => network.rpcUrl === preferredRpcUrl) ||
      matches[0]
    );
  }

  assertNoPendingRequest(origin) {
    const pendingOrigins = [
      ...this.checking,
      ...[...this.pending.values()].map(({ request }) => request.origin),
    ];
    if (pendingOrigins.includes(origin)) {
      throw rpcErrors.resourceUnavailable(
        `A network request from ${origin} is already pending. Please wait.`,
      );
    }
  }

  addRequest(origin, { type, network, warnings, perform }) {
    const id = String(createId());
    const request = {
      id,
      origin,
      type,
      network,
      warnings,
      fromChainId: this.getCurrentChainId(),
      time: Date.now(),
    };
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { request, perform, resolve, reject });
    });
    this.update();
    this.showApprovalRequest();
    return result;
  }

  async approve(id) {
    const entry = this.take(id);
    try {
      await entry.perform();
      entry.resolve(null);
    } catch (error) {
      entry.reject(error);
      throw error;
    }
  }

  reject(id) {
    this.take(id).reject(providerErrors.userRejectedRequest());
  }

  take(id) {
    const entry = this.pending.get(id);
    if (!entry) {
      throw new Error(`Network request "${id}" not found.`);
    }
    this.pending.delete(id);
    this.update();
    return entry;
  }

  update() {
    const pendingNetworkRequests = {};
    for (const [id, { request }] of this.pending) {
      pendingNetworkRequests[id] = request;
    }
    this.memStore.putState({ pendingNetworkRequests });
    this.emit('update');
  }
}
