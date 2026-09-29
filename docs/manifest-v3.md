# Manifest V3

Chromium builds use a service worker and require Chrome 120 or newer. Firefox
builds use the Manifest V3 event-page implementation and require Firefox 128 or
newer. The build generates the appropriate background declaration for each
browser. Node.js 26.10.0 remains the development runtime.

## Background lifecycle

Browser listeners are registered synchronously. Incoming ports buffer messages
until persisted state has loaded and migrations have completed. Controller
updates are written to `storage.local` without the old one-second debounce.

The encrypted vault format remains compatible with existing installations.
An unlocked browser session stores the derived vault encryption key in
`storage.session`, restricted to trusted extension contexts. The password and
decrypted keyrings are not stored there. Locking clears the session key; browser
exit, extension reload, and extension updates also clear browser session storage.
A restarted worker validates the cached key against the current vault before
restoring the session. A mismatched vault or expired auto-lock deadline requires
the user to unlock again.

Auto-lock deadlines retain their last-activity timestamp across worker restarts.
Browser alarms handle auto-lock and pending-transaction checks while the worker
is suspended. An open wallet UI sends activity messages to keep its controller
available during user interaction. Dapp connections reconnect when a new request
arrives after suspension. Interrupted requests return a disconnection error;
signing requests are never automatically replayed.

## Browser APIs and hardware

The manifest uses `action`, separate host permissions, an extension-page CSP,
and structured web-accessible resources. The provider is a packaged `MAIN` world
content script, so it no longer injects executable text into web pages. HTTP and
HTTPS host permissions support custom RPC endpoints and ENS gateway requests.

On Chromium, Ledger and Trezor transports run in an offscreen document because
their integrations require iframes. Only public hardware-keyring state and
explicit hardware operations cross that message boundary. Software keyrings and
the vault remain in the service worker. Locking closes the offscreen document.
Firefox runs those transports in its event page.

Development reload uses a worker-compatible local WebSocket connection. The
previous remote React DevTools bootstrap is omitted from extension bundles to
respect the Manifest V3 CSP.

## Verification

Build test bundles before running the Chrome smoke suite:

```sh
yarn build:test
yarn test:e2e:mv3:chrome
```

The suite covers unlock, worker termination, dapp reconnection, restoring an
unlocked session, explicit lock persistence, auto-lock after worker termination,
message signing, and a transaction.
The Chrome harness loads unpacked extensions through the browser-level CDP
extension debugging API, which requires a current Chrome release. Unit tests
also exercise legacy vault compatibility and hardware transaction serialization.

Physical Ledger and Trezor devices still require manual integration testing.
