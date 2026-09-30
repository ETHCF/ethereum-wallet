# Telemetry

This build does not collect MetaMetrics usage events or send Sentry crash reports.
The event collectors, tracking RPC method, reporting SDKs, analytics consent UI,
reporting configuration, and Sentry release uploads have been removed.

Fresh wallets do not create telemetry identifiers, event counters, or consent
preferences. Historical wallet upgrade migrations have been removed.
Errors remain available locally in the browser console and error screen.

Mobile sync disables PubNub's automatic request-latency collection and reporting.
Its transport identifier is generated afresh for each sync session.

Wallet functionality still uses network services, including configured Ethereum
RPC endpoints, prices, ENS gateways, and optional hardware-wallet services.
The built-in Ethereum mainnet connection uses [PublicNode](https://ethereum.publicnode.com/);
you can select your own RPC endpoint in Settings > Networks.

3Box cloud backup and restore of preferences and address books have been removed.

To verify the removal and wallet flows:

```sh
yarn test:unit
yarn lint
yarn build:test
yarn test:e2e:mv3:chrome
```

Browser tests check that tracking preferences stay absent and cover settings,
direct create/import onboarding, signing, transactions, and service-worker recovery.
