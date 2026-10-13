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
The built-in Ethereum mainnet connection uses
[PublicNode](https://ethereum.publicnode.com/), and falls back to dRPC, 1RPC and
Blast when it cannot be reached, so an outage at one host does not take the
wallet offline. Any of these sees the requests the wallet makes. You can select
your own RPC endpoint in Settings > Networks.

To verify the removal and wallet flows:

```sh
yarn test:unit
yarn lint
yarn build:test
yarn test:e2e:mv3:chrome
```

Browser tests cover settings, direct create/import onboarding, signing,
transactions, and service-worker recovery.
