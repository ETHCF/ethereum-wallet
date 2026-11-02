# How to take a State Dump

Sometimes a UI bug is hard to reproduce. A diagnostic summary can help a developer understand the wallet's status when the bug occurred.

A MetaECF developer may ask for a "state dump". This is an allowlisted summary of wallet status, counts of accounts and pending requests, chain ID, locale, and browser/version/platform information. It excludes private keys, recovery phrases, vaults, account addresses, RPC URLs, site information, and transaction or message contents. It is not a complete copy of wallet state.

To take a state dump, follow these steps:

1. Get the MetaECF popup to the point where it shows the bug (the developer will probably specify exactly where).
2. Right click on the extension popup UI, and in the menu, click "Inspect". This will open the developer tools.
3. In case it isn't already selected, click the "Console" tab in the new Developer Tools window.
4. In the console, type this command exactly: `logState()`. This should print a bunch of JSON text into your console.
5. Copy that printed JSON text
6. Review the summary before sharing it. Never add private keys, recovery phrases, or passwords to a bug report.
7. Send that JSON text to the developer, ideally pasting it in the issue regarding the bug.
