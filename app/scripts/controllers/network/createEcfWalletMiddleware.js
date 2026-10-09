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

  const processTypedMessageWithOrigin = (
    msgParams,
    request,
    context,
    msgVersion,
  ) => processTypedMessage(msgParams, withOrigin(request, context), msgVersion);

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
        // The middleware passes the version ('V1', 'V3' or 'V4') on.
        processTypedMessage: processTypedMessageWithOrigin,
        processTypedMessageV3: processTypedMessageWithOrigin,
        processTypedMessageV4: processTypedMessageWithOrigin,
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
