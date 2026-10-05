import { providerErrors } from '@metamask/rpc-errors';

// Requests that open a prompt. A site that keeps sending them after being
// rejected is flooding the user, often to wear them down into approving.
export const PROMPTING_METHODS = new Set([
  'eth_requestAccounts',
  'wallet_requestPermissions',
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_decrypt',
  'eth_getEncryptionPublicKey',
  'wallet_watchAsset',
  'ecf_wallet_watchAsset',
  'wallet_addEthereumChain',
  'wallet_switchEthereumChain',
]);

export const REJECTION_LIMIT = 3;
export const REJECTION_WINDOW_MS = 30 * 1000;
export const BLOCK_DURATION_MS = 60 * 1000;

const USER_REJECTED = 4001;

/**
 * Blocks a site's prompting requests for a minute after the user rejects
 * several in quick succession. The state is shared by all of a site's tabs.
 */
export default class OriginThrottler {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.origins = new Map();
  }

  isBlocked(origin) {
    const state = this.origins.get(origin);
    if (!state?.blockedUntil) {
      return false;
    }
    if (state.blockedUntil > this.now()) {
      return true;
    }
    this.origins.delete(origin);
    return false;
  }

  recordResult(origin, error) {
    if (error?.code !== USER_REJECTED) {
      // Any other outcome means the user is engaging with the site normally.
      this.origins.delete(origin);
      return;
    }
    const now = this.now();
    const rejections = (this.origins.get(origin)?.rejections || []).filter(
      (time) => time > now - REJECTION_WINDOW_MS,
    );
    rejections.push(now);
    this.origins.set(
      origin,
      rejections.length >= REJECTION_LIMIT
        ? { rejections: [], blockedUntil: now + BLOCK_DURATION_MS }
        : { rejections },
    );
  }

  createMiddleware({ origin }) {
    return (req, res, next, end) => {
      if (!PROMPTING_METHODS.has(req.method)) {
        next();
        return;
      }
      if (this.isBlocked(origin)) {
        end(
          providerErrors.unauthorized(
            'Request blocked: you rejected several requests from this site in a row. Try again in a minute.',
          ),
        );
        return;
      }
      next((done) => {
        this.recordResult(origin, res.error);
        done();
      });
    };
  }
}
