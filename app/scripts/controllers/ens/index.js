import { ObservableStore } from '@metamask/obs-store';
import log from 'loglevel';

import Ens, { normalizeEnsName } from './ens';
import { getNetworkEnsSupport } from './networks';
import { toChecksumHexAddress } from '../../lib/checksum-address';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_X_ERROR_ADDRESS = '0x';

// The reasons resolveName gives for a name that does not resolve.
export const ENS_RESOLUTION_ERRORS = Object.freeze({
  unsupported: 'unsupported',
  invalidName: 'invalidName',
  notFound: 'notFound',
  noAddress: 'noAddress',
  badRecord: 'badRecord',
  offchainLookupFailed: 'offchainLookupFailed',
  networkChanged: 'networkChanged',
  failed: 'failed',
});

export default class EnsController {
  constructor({ ens, provider, networkStore } = {}) {
    const initState = {
      ensResolutionsByAddress: {},
    };

    this._ens = ens;
    if (!this._ens) {
      const network = networkStore.getState();
      if (getNetworkEnsSupport(network)) {
        this._ens = new Ens({
          network,
          provider,
        });
      }
    }

    this.store = new ObservableStore(initState);
    networkStore.subscribe((network) => {
      this.store.putState(initState);
      if (getNetworkEnsSupport(network)) {
        this._ens = new Ens({
          network,
          provider,
        });
      } else {
        delete this._ens;
      }
    });
  }

  /**
   * Resolves a name the user typed to an address. This is the only lookup
   * allowed to follow a resolver to a CCIP-read gateway, so that a gateway
   * is only contacted for a name the user entered.
   *
   * @param {string} name - The name, as typed
   * @returns {Promise<{name: string, address: string} | {error: string}>} The
   * normalized name and its checksummed address, or why it did not resolve
   * (one of ENS_RESOLUTION_ERRORS)
   */
  async resolveName(name) {
    const ens = this._ens;
    if (!ens) {
      return { error: ENS_RESOLUTION_ERRORS.unsupported };
    }
    let normalized;
    try {
      normalized = normalizeEnsName(name);
    } catch (_) {
      return { error: ENS_RESOLUTION_ERRORS.invalidName };
    }
    let address;
    try {
      address = await ens.lookup(normalized, { allowOffchain: true });
    } catch (error) {
      log.debug(error);
      return {
        error: Object.hasOwn(ENS_RESOLUTION_ERRORS, error?.code)
          ? error.code
          : ENS_RESOLUTION_ERRORS.failed,
      };
    }
    if (ens !== this._ens) {
      return { error: ENS_RESOLUTION_ERRORS.networkChanged };
    }
    if (
      !address ||
      address === ZERO_ADDRESS ||
      address === ZERO_X_ERROR_ADDRESS
    ) {
      return { error: ENS_RESOLUTION_ERRORS.noAddress };
    }
    return { name: normalized, address: toChecksumHexAddress(address) };
  }

  reverseResolveAddress(address) {
    return this._reverseResolveAddress(toChecksumHexAddress(address));
  }

  async _reverseResolveAddress(address) {
    const ens = this._ens;
    if (!ens) {
      return undefined;
    }

    const state = this.store.getState();
    if (state.ensResolutionsByAddress[address]) {
      return state.ensResolutionsByAddress[address];
    }

    let domain;
    try {
      domain = await ens.reverse(address);
    } catch (error) {
      log.debug(error);
      return undefined;
    }

    // A primary name must already be normalized (ENSIP-15), which also
    // refuses confusable and display-disguising characters.
    let name;
    try {
      name = normalizeEnsName(domain);
    } catch (error) {
      log.debug(error);
      return undefined;
    }
    if (name !== domain) {
      return undefined;
    }

    // The name must resolve back to the address, or anyone could claim any
    // name. This lookup is not one the user asked for, so it stays onchain.
    let registeredAddress;
    try {
      registeredAddress = await ens.lookup(name);
    } catch (error) {
      log.debug(error);
      return undefined;
    }

    if (
      !registeredAddress ||
      registeredAddress === ZERO_ADDRESS ||
      registeredAddress === ZERO_X_ERROR_ADDRESS
    ) {
      return undefined;
    }

    if (toChecksumHexAddress(registeredAddress) !== address) {
      return undefined;
    }

    // The network changed while looking: the answer is for the old one.
    if (ens !== this._ens) {
      return undefined;
    }

    this._updateResolutionsByAddress(address, name);
    return name;
  }

  _updateResolutionsByAddress(address, domain) {
    const oldState = this.store.getState();
    this.store.putState({
      ensResolutionsByAddress: {
        ...oldState.ensResolutionsByAddress,
        [address]: domain,
      },
    });
  }
}
