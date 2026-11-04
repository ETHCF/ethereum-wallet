// this must run before anything else
import './lib/freezeGlobals';

import EthQuery from '@metamask/eth-query';
import { getUniqueId } from '@metamask/json-rpc-engine';
import { ExtensionPortStream } from 'extension-port-stream';
import log from 'loglevel';
import StreamProvider from 'web3-stream-provider';

import launchEcfWalletUi from '../../ui';
import deserializeRpcError from './lib/deserialize-rpc-error';
import {
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_POPUP,
} from './lib/enums';
import extension from './lib/extension-api';
import metaRPCClientFactory from './lib/metaRPCClientFactory';
import readDisconnectError from './lib/read-disconnect-error';
import { setupMultiplex } from './lib/stream-utils';
import { getEnvironmentType } from './lib/util';
import ExtensionPlatform from './platforms/extension';

start().catch(log.error);

async function start() {
  // create platform global
  global.platform = new ExtensionPlatform();

  // identify window type (popup, notification)
  const windowType = getEnvironmentType();

  // setup stream to background
  const extensionPort = extension.runtime.connect({ name: windowType });
  const connectionStream = new ExtensionPortStream(extensionPort);
  // An open wallet UI is an active session. Messages keep its controller alive
  // while the user reviews an approval or edits a form.
  const heartbeat = setInterval(() => {
    // Fails when the extension is reloaded or updated.
    extension.runtime
      .sendMessage({ type: 'ecf-wallet-ui-active' })
      .catch(() => clearInterval(heartbeat));
  }, 20000);
  extensionPort.onDisconnect.addListener(() => {
    readDisconnectError(extensionPort);
    clearInterval(heartbeat);
    window.location.reload();
  });

  const activeTab = await queryCurrentActiveTab(windowType);
  initializeUiWithTab(activeTab);

  function displayCriticalError(container, err) {
    container.innerHTML =
      '<div class="critical-error">The MetaECF app failed to load: please open and close MetaECF again to restart.</div>';
    container.style.height = '80px';
    log.error(err.stack);
    throw err;
  }

  function initializeUiWithTab(tab) {
    const container = document.getElementById('app-content');
    initializeUi(tab, container, connectionStream, (err, store) => {
      if (err) {
        displayCriticalError(container, err);
        return;
      }

      const state = store.getState();
      const { ecfWallet: { completedOnboarding } = {} } = state;

      if (!completedOnboarding && windowType !== ENVIRONMENT_TYPE_FULLSCREEN) {
        global.platform.openExtensionInBrowser();
      }
    });
  }
}

async function queryCurrentActiveTab(windowType) {
  // Only the popup belongs to the page the user is on. Its URL is readable
  // through the http and https host permissions, the only pages the wallet
  // can connect to.
  if (windowType !== ENVIRONMENT_TYPE_POPUP) {
    return {};
  }

  const [activeTab] = await extension.tabs.query({
    active: true,
    currentWindow: true,
  });
  const { id, title, url } = activeTab;
  const { origin, protocol } = url ? new URL(url) : {};

  if (!origin || origin === 'null') {
    return {};
  }

  return { id, title, origin, protocol, url };
}

function initializeUi(activeTab, container, connectionStream, cb) {
  connectToAccountManager(connectionStream, (err, backgroundConnection) => {
    if (err) {
      cb(err);
      return;
    }

    launchEcfWalletUi(
      {
        activeTab,
        container,
        backgroundConnection,
      },
      cb,
    );
  });
}

/**
 * Establishes a connection to the background and a Web3 provider
 *
 * @param {ExtensionPortStream} connectionStream - PortStream instance establishing a background connection
 * @param {Function} cb - Called when controller connection is established
 */
function connectToAccountManager(connectionStream, cb) {
  const mx = setupMultiplex(connectionStream);
  setupControllerConnection(mx.createStream('controller'), cb);
  setupWeb3Connection(mx.createStream('provider'));
}

/**
 * Establishes a streamed connection to a Web3 provider
 *
 * @param {object} connectionStream - The multiplexed substream for the provider
 */
function setupWeb3Connection(connectionStream) {
  const providerStream = new StreamProvider();
  providerStream.pipe(connectionStream).pipe(providerStream);
  connectionStream.on('error', console.error.bind(console));
  providerStream.on('error', console.error.bind(console));
  // Libraries such as the token tracker use the EIP-1193 request method,
  // which this provider predates.
  providerStream.request = ({ method, params }) =>
    new Promise((resolve, reject) => {
      providerStream.sendAsync(
        { id: getUniqueId(), jsonrpc: '2.0', method, params },
        (error, response) => {
          const rpcError = error || response?.error;
          if (rpcError) {
            reject(deserializeRpcError(rpcError) ?? rpcError);
          } else {
            resolve(response.result);
          }
        },
      );
    });
  global.ethereumProvider = providerStream;
  global.ethQuery = new EthQuery(providerStream);
}

/**
 * Establishes a streamed connection to the background account manager
 *
 * @param {object} connectionStream - The multiplexed substream for the controller
 * @param {Function} cb - Called when the remote account manager connection is established
 */
function setupControllerConnection(connectionStream, cb) {
  cb(null, metaRPCClientFactory(connectionStream));
}
