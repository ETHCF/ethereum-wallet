# Telemetry

This build does not collect MetaMetrics usage events or send Sentry crash reports.
The event collectors, tracking RPC method, reporting SDKs, analytics consent UI,
reporting configuration, and Sentry release uploads have been removed.

Migration 48 deletes the old telemetry identifier, event counter, and consent
preference from existing wallet storage. New wallets do not create these fields.
Errors remain available locally in the browser console and error screen.

Mobile sync disables PubNub's automatic request-latency collection and reporting.
Its transport identifier is generated afresh for each sync session.

Wallet functionality still uses network services, including configured Ethereum
RPC endpoints, prices, ENS gateways, and optional hardware-wallet or 3Box services.

To verify the removal and wallet flows:

```sh
yarn test:unit
yarn lint
yarn build:test
yarn test:e2e:mv3:chrome
```

The migration tests check that wallet data is preserved when tracking preferences
are removed. Browser tests cover preference cleanup, settings, direct create/import
onboarding, signing, transactions, and service-worker recovery.
