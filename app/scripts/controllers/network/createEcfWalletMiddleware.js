import { createWalletMiddleware } from '@metamask/eth-json-rpc-middleware';
import {
  createScaffoldMiddleware,
  mergeMiddleware,
} from '@metamask/json-rpc-engine';
import { asLegacyMiddleware } from '@metamask/json-rpc-engine/v2';

import {
  createPendingNonceMiddleware,
  createPendingTxMiddleware,
} from './middleware/pending';

export default function createEcfWalletMiddleware({
  version,
  getAccounts,
  processTransaction,
  processTypedMessage,
  processTypedMessageV3,
  processTypedMessageV4,
  processPersonalMessage,
  processDecryptMessage,
  processEncryptionPublicKey,
  getPendingNonce,
  getPendingTransactionByHash,
}) {
  // The wallet middleware keeps the requesting origin in its context; the
  // handlers below expect it on the request, as they did before.
  const withOrigin = (request, context) => ({
    ...request,
    origin: context.get('origin'),
  });

  const ecfWalletMiddleware = mergeMiddleware([
    createScaffoldMiddleware({
      // staticSubprovider
      eth_syncing: false,
      web3_clientVersion: `ecf-wallet/v${version}`,
    }),
    asLegacyMiddleware(
      createWalletMiddleware({
        getAccounts: (origin) => getAccounts({ origin }),
        processTransaction: (txParams, request, context) =>
          processTransaction(txParams, withOrigin(request, context)),
        processTypedMessage: (msgParams, request, context, msgVersion) =>
          processTypedMessage(
            msgParams,
            withOrigin(request, context),
            msgVersion,
          ),
        processTypedMessageV3: (msgParams, request, context, msgVersion) =>
          processTypedMessageV3(
            msgParams,
            withOrigin(request, context),
            msgVersion,
          ),
        processTypedMessageV4: (msgParams, request, context, msgVersion) =>
          processTypedMessageV4(
            msgParams,
            withOrigin(request, context),
            msgVersion,
          ),
        processPersonalMessage: (msgParams, request, context) =>
          processPersonalMessage(msgParams, withOrigin(request, context)),
        // These two already receive the origin with the request.
        processDecryptMessage,
        processEncryptionPublicKey,
      }),
    ),
    createPendingNonceMiddleware({ getPendingNonce }),
    createPendingTxMiddleware({ getPendingTransactionByHash }),
  ]);
  return ecfWalletMiddleware;
}
