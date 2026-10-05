import extension from './lib/extension-api';
import { PHISHING_WARNING_CONTINUE } from './lib/phishing-warnings';
import readDisconnectError from './lib/read-disconnect-error';

document.addEventListener('DOMContentLoaded', start);

function start() {
  document.getElementById('csdbLink').href = `https://cryptoscamdb.org/search`;

  // The background knows which site this tab was sent away from, and
  // continuing goes back to that site only.
  document.getElementById('unsafe-continue').addEventListener('click', () => {
    const port = extension.runtime.connect({ name: PHISHING_WARNING_CONTINUE });
    port.onDisconnect.addListener(() => readDisconnectError(port));
  });
}
