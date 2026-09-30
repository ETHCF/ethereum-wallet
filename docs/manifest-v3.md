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

Ledger and Trezor transports run in a packaged extension connection tab, opened
in the background on first device use and closed when the wallet locks. Trezor
Connect needs the tabs/windows APIs, which are unavailable in Chromium offscreen
documents. Both browsers use the same transport boundary. Only public keyring
state and explicit hardware operations cross it; software keyrings and the vault
remain in the background process. Closing the connection tab interrupts pending
requests; signing requests are never automatically replayed.

Ledger uses WebHID in Chromium browsers. The Connect button requests device
permission directly from the user's click; the transport opens only an already
authorized device. Firefox does not offer WebHID, so Ledger connection reports an
unsupported browser. Trezor uses Connect's popup and Bridge/WebUSB flow.

Hardware SDKs are bundled separately with esbuild because their current module
formats are not supported by the legacy Browserify pipeline. Trezor's popup and
USB-permission scripts are copied from the installed Connect package during the
build, keeping their message protocol aligned with the SDK.

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
also exercise legacy vault compatibility, hardware account migration, transaction
serialization, personal signing, and EIP-712 V4 signing. The browser hardware test
checks packaged transport startup, the approval boundary, and cleanup on lock.

Physical Ledger and Trezor devices still require manual integration testing.
