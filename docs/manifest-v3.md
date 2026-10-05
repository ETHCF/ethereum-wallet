# Manifest V3

Chromium builds use a service worker and require Chrome 120 or newer. Firefox
builds use the Manifest V3 event-page implementation and require Firefox 128 or
newer. The build generates the appropriate background declaration for each
browser. Node.js 24.21.0 is the development runtime.

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

Hardware SDKs are bundled separately into `hardware.js`, which runs in the
hardware page and uses its own compatible EthereumJS version. Trezor's popup and
USB-permission scripts are copied from the installed Connect package during the
build, keeping their message protocol aligned with the SDK. The popup content-script
match includes query parameters so the SDK popup can complete its handshake.

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

## Transaction envelopes and signing

The transaction implementation was compared with the companion current ecf-wallet
checkout (`@metamask/transaction-controller` 72.0.1). Supported envelopes are:

| Envelope | Software accounts | Ledger | Trezor |
| --- | --- | --- | --- |
| Legacy / type 0 | Yes | Yes | Yes |
| EIP-2930 access list / type 1 | Yes | Yes | Unsupported by Connect; use type 2 with an access list |
| EIP-1559 fee market / type 2 | Yes | Yes | Yes |
| EIP-7702 set code / type 4 | Internal requests with signed authorizations | No | No |
| EIP-4844 blob / type 3 | No | No | No |

As in the reference, dapp-supplied EIP-7702 transactions and authorizations are
rejected. The internal type-4 path accepts already signed authorization lists,
requires a Prague block (`requestsHash`), and displays the delegation targets.
It does not add the reference wallet's smart-account upgrade, bundler, relay, or
batch-transaction products. EthereumJS 10 implements the final EIP-7702 encoding,
including scalar authorization nonces. Hardware SDKs use their compatible
EthereumJS 5 adapter for types 1 and 2 only.

London networks default new wallet sends to type 2. Explicit legacy envelopes
and dapp `gasPrice` requests remain supported. Fee caps default to twice the
latest base fee plus the suggested priority fee; partial dapp fee fields are
preserved. Confirmations show the maximum authorized cost and allow editing both
caps. Replacement transactions increase both caps with upward rounding and
retain the nonce. Receipts display `effectiveGasPrice` for the actual fee.
Access lists and authorization lists survive estimation, storage, signing, and
pending-transaction RPC responses. Signing uses `eth_chainId`, independently of
`net_version` and the existing history namespace.

The background bundle includes EthereumJS 10, current `@metamask/eth-sig-util` 9
and the SIWE parser (`app/scripts/lib/transaction-codec-implementation.js`).
Private keys remain in the background process. The same module supplies the HD
and imported-key keyrings (`@metamask/eth-hd-keyring`,
`@metamask/eth-simple-keyring`) to the wallet's own keyring controller, which
keeps the existing vault format. `app/scripts/lib/modern-controllers-implementation.js`
supplies `@metamask/address-book-controller` and `@metamask/permission-controller`.
All scripts are built with webpack (`development/build/webpack.config.js`); the
scripts injected into pages (`inpage.js`, `contentscript.js`) are built
separately so they stay small and carry no crypto polyfills.

EIP-712 V1, V3, and V4 requests are supported. V3/V4 accept JSON strings or
objects; V4 supports arrays and nested structs. Validation hashes the actual
payload before approval and checks an explicitly supplied domain chain ID.
The confirmation displays domain fields, message values (including `false`),
and type definitions. Software signing uses the current implementation without
changing vault serialization. Hardware signing uses the current SDKs and is
subject to device/firmware support.

SIWE (ERC-4361) messages use `personal_sign` and retain their exact signed bytes.
The confirmation displays the requesting origin, account, statement, URI,
network, nonce, validity dates, request ID, and resources. A network mismatch
produces a warning. Malformed sign-in requests, origin/scheme/port mismatches,
account mismatches, expired requests, and requests before their validity window
cannot be approved. Validation runs again at approval; ordinary personal-sign
messages remain supported. These checks are stricter than the reference's
warning-only account mismatch. Server-side nonce/session verification remains
the relying party's responsibility.

The unit suite covers typed envelopes, replacements, RPC identity, current
hardware SDK signing with simulated devices, typed-data validation, SIWE, and
fee editing. The Chrome suite covers SIWE approval/rejection and EIP-712 V4.
When `anvil` is installed, it also mines type-1/type-2 transactions on a local
Prague chain; that case is skipped when Anvil is unavailable. Physical hardware
signing still needs device testing.
