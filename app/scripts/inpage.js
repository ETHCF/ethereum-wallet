import ObjectMultiplex from '@metamask/object-multiplex';
import { WindowPostMessageStream } from '@metamask/post-message-stream';
import { MetaMaskInpageProvider } from '@metamask/providers';
import log from 'loglevel';
import pump from 'pump';

import announceProvider from './lib/announce-provider';
import shouldInjectProvider from './lib/should-inject-provider';

log.setDefaultLevel(process.env.ECF_WALLET_DEBUG ? 'debug' : 'warn');

/**
 * The upstream provider, also identified as ECF Wallet: it adds isECFWallet,
 * and _ecfwallet replaces the _metamask namespace.
 */
class ECFWalletInpageProvider extends MetaMaskInpageProvider {
  constructor(connectionStream, options) {
    super(connectionStream, options);
    // isMetaMask stays true, as upstream sets it, for dapps that only check for it.
    this.isECFWallet = true;

    // The upstream namespace warns under MetaMask's name, so warn under ours
    // instead. Both names point at the same object: sites that call
    // `ethereum._metamask.isUnlocked()` would otherwise throw.
    const experimentalApi = this._metamask;
    delete this._metamask;
    this._sentWarnings.experimentalMethods = true;
    let warned = false;
    const namespace = new Proxy(experimentalApi, {
      get: (target, property) => {
        if (!warned) {
          log.warn(
            `ECF Wallet: 'ethereum._ecfwallet' exposes non-standard, experimental methods. They may be removed or changed without warning.`,
          );
          warned = true;
        }
        return Reflect.get(target, property);
      },
    });
    this._ecfwallet = namespace;
    this._metamask = namespace;
  }
}

//
// setup plugin communication
//

if (shouldInjectProvider()) {
  // setup background connection
  const ecfWalletStream = new WindowPostMessageStream({
    name: 'ecf-wallet-inpage',
    target: 'ecf-wallet-contentscript',
  });
  // The content script forwards each named channel to the background.
  const mux = new ObjectMultiplex();
  pump(ecfWalletStream, mux, ecfWalletStream, (error) => {
    log.warn('ecf-wallet - lost connection to the content script', error);
  });

  const inpageProvider = new ECFWalletInpageProvider(
    mux.createStream('provider'),
    {
      logger: log,
      // The site's name and icon are shown when it asks to connect.
      shouldSendMetadata: true,
    },
  );
  // As upstream does: pages cannot delete the provider's properties.
  const provider = new Proxy(inpageProvider, {
    deleteProperty: () => true,
    get: (target, property) => target[property],
  });

  // Preserve another wallet's legacy globals. Discovery works independently of
  // window.ethereum, even when another extension makes that property read-only.
  setLegacyProvider(provider);

  announceProvider(provider);
}

/**
 * Sets window.ethereum unless another wallet already set it or claimed it with a
 * read-only property or a getter, which may still return nothing.
 *
 * @param {object} provider - The provider
 */
function setLegacyProvider(provider) {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
  const claimed =
    descriptor &&
    (descriptor.get || descriptor.set ? !descriptor.set : !descriptor.writable);
  if (window.ethereum || claimed) {
    return;
  }
  try {
    window.ethereum = provider;
    window.dispatchEvent(new window.Event('ethereum#initialized'));
  } catch (error) {
    log.debug('ecf-wallet - could not set the legacy provider', error);
  }
}
