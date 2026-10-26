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

const SELECTED_NETWORK_CLIENT_ID = 'selected';

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
  getChainId,
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

  // The wallet middleware looks up the network client of a request with no
  // chain ID of its own. There is one network at a time, so this replaces any
  // ID the page sent with the one the lookup below answers for.
  const setNetworkClientId = (req, _res, next) => {
    req.networkClientId = SELECTED_NETWORK_CLIENT_ID;
    next();
  };
  const getNetworkClientById = () => ({
    configuration: { chainId: getChainId() },
  });

  const ecfWalletMiddleware = mergeMiddleware([
    createScaffoldMiddleware({
      // staticSubprovider
      eth_syncing: false,
      web3_clientVersion: `ecf-wallet/v${version}`,
    }),
    setNetworkClientId,
    asLegacyMiddleware(
      createWalletMiddleware({
        getAccounts: (origin) => getAccounts({ origin }),
        getNetworkClientById,
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
