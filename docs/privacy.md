# Telemetry

This build does not collect MetaMetrics usage events or send Sentry crash reports.
The event collectors, tracking RPC method, reporting SDKs, analytics consent UI,
reporting configuration, and Sentry release uploads have been removed.

Fresh wallets do not create telemetry identifiers, event counters, or consent
preferences. Historical wallet upgrade migrations have been removed.
Errors remain available locally in the browser console and error screen.

Price feeds have been removed. The wallet makes no call to CryptoCompare or
CoinGecko, and shows no fiat conversion. The Etherscan lookup that fetched
incoming transactions for an account has been removed as well; the transaction
list is built from what the wallet itself has seen. Mobile sync and its PubNub
transport are gone.

Wallet functionality still uses network services, including configured Ethereum
RPC endpoints, ENS gateways, and optional hardware-wallet services.
ENS websites open only when you type `eth`, then a .eth name, in the address
bar; the wallet does not watch page loads and does not request the
`webRequest` permission.
Resolving an offchain ENS name you type as a send recipient (ENSIP-10
wildcard names that use EIP-3668 CCIP-read, such as `cb.id` subnames) contacts
the gateway the name's resolver contract specifies. Only https gateways are
used, without cookies or a referrer, with a timeout and a size limit, and at
most three per lookup; the gateway sees your IP address and the name. Names
shown next to addresses (reverse resolution) never contact a gateway.
The built-in Ethereum mainnet connection uses
[PublicNode](https://ethereum.publicnode.com/), and falls back to dRPC, 1RPC and
Blast when it cannot be reached, so an outage at one host does not take the
wallet offline. Any of these sees the requests the wallet makes. You can select
your own RPC endpoint in Settings > Networks.

Before you confirm a transaction, the wallet asks the selected RPC endpoint to
simulate it with the standard `eth_simulateV1` method, and reads the symbol and
decimals of the tokens it moves with `eth_call`, to show an estimate of your
balance changes. The endpoint therefore sees a transaction you are about to
confirm even if you reject it. No third-party simulation service is used; if
the endpoint does not support `eth_simulateV1`, no preview is shown. The preview
is display-only and never changes what is signed.

To verify the removal and wallet flows:

```sh
yarn test:unit
yarn lint
yarn build:test
yarn test:e2e:mv3:chrome
```

Browser tests cover settings, direct create/import onboarding, signing,
transactions, and service-worker recovery.
