import dnode from 'dnode';
import { EventEmitter } from 'events';
import { ExtensionPortStream } from 'extension-port-stream';
import querystring from 'querystring';

import extension from './lib/extension-api';
import readDisconnectError from './lib/read-disconnect-error';
import { setupMultiplex } from './lib/stream-utils';
import { getEnvironmentType } from './lib/util';
import ExtensionPlatform from './platforms/extension';

document.addEventListener('DOMContentLoaded', start);

function start() {
  const hash = window.location.hash.substring(1);
  const suspect = querystring.parse(hash);

  document.getElementById('csdbLink').href = `https://cryptoscamdb.org/search`;

  global.platform = new ExtensionPlatform();

  const extensionPort = extension.runtime.connect({
    name: getEnvironmentType(),
  });
  extensionPort.onDisconnect.addListener(() =>
    readDisconnectError(extensionPort),
  );
  const connectionStream = new ExtensionPortStream(extensionPort);
  const mx = setupMultiplex(connectionStream);
  setupControllerConnection(
    mx.createStream('controller'),
    (err, ecfWalletController) => {
      if (err) {
        return;
      }

      const continueLink = document.getElementById('unsafe-continue');
      continueLink.addEventListener('click', () => {
        ecfWalletController.safelistPhishingDomain(suspect.hostname);
        window.location.href = suspect.href;
      });
    },
  );
}

function setupControllerConnection(connectionStream, cb) {
  const eventEmitter = new EventEmitter();
  const ecfWalletControllerDnode = dnode({
    sendUpdate(state) {
      eventEmitter.emit('update', state);
    },
  });
  connectionStream.pipe(ecfWalletControllerDnode).pipe(connectionStream);
  ecfWalletControllerDnode.once('remote', (backgroundConnection) =>
    cb(null, backgroundConnection),
  );
}
