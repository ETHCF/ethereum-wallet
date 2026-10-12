import extension from './lib/extension-api';
import PhishingWarnings, {
  PHISHING_WARNING_CONTINUE,
} from './lib/phishing-warnings';
import readDisconnectError from './lib/read-disconnect-error';

document.addEventListener('DOMContentLoaded', start);

function start() {
  document.getElementById('csdbLink').href = `https://cryptoscamdb.org/search`;
  showFlaggedSite().catch(() => undefined);

  // The background knows which site this tab was sent away from, and
  // continuing goes back to that site only.
  document.getElementById('unsafe-continue').addEventListener('click', () => {
    const port = extension.runtime.connect({ name: PHISHING_WARNING_CONTINUE });
    port.onDisconnect.addListener(() => readDisconnectError(port));
  });
}

/**
 * Names the site the warning is for. It is read from the record the
 * background kept for this tab, not from the page's URL, so a website cannot
 * choose what the warning says.
 */
async function showFlaggedSite() {
  const tab = await extension.tabs.getCurrent();
  if (tab?.id === undefined) {
    return;
  }
  const warning = await new PhishingWarnings(extension.storage.session).get(
    tab.id,
  );
  if (!warning) {
    return;
  }
  const pageHostname = new URL(warning.href).hostname;
  document.getElementById('flagged-hostname').textContent = warning.hostname;
  if (pageHostname !== warning.hostname) {
    // A flagged frame took over its whole tab.
    document.getElementById('flagged-page-hostname').textContent = pageHostname;
    document.getElementById('flagged-frame').hidden = false;
  }
  document.getElementById('flagged-site').hidden = false;
}
