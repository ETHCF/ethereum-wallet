import { rpcErrors } from '@metamask/rpc-errors';

/**
 * RPC methods the wallet refuses outright, mapped to the reason given to the site.
 * eth_sign signs an arbitrary 32-byte hash, which can be a transaction or a
 * token permit that the user cannot read.
 * eth_signTypedData_v1 is not handled by the wallet, so it would otherwise be
 * forwarded, typed data and address included, to the RPC node; this refuses
 * it for internal callers too, which skip the permissions middleware.
 */
export const BLOCKED_METHODS = {
  eth_sign:
    'eth_sign is disabled because it can sign arbitrary hashes, including transactions. Use personal_sign or eth_signTypedData_v4 instead.',
  eth_signTypedData_v1:
    'eth_signTypedData_v1 is not supported. Use eth_signTypedData_v4 instead.',
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
