import { rpcErrors } from '@metamask/rpc-errors';

/**
 * RPC methods the wallet refuses outright, mapped to the reason given to the site.
 * eth_sign signs an arbitrary 32-byte hash, which can be a transaction or a
 * token permit that the user cannot read.
 */
export const BLOCKED_METHODS = {
  eth_sign:
    'eth_sign is disabled because it can sign arbitrary hashes, including transactions. Use personal_sign or eth_signTypedData_v4 instead.',
};

export default function createMethodBlockMiddleware() {
  return (req, _res, next, end) => {
    if (Object.prototype.hasOwnProperty.call(BLOCKED_METHODS, req.method)) {
      end(rpcErrors.methodNotFound(BLOCKED_METHODS[req.method]));
      return;
    }
    next();
  };
}
