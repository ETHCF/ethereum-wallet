# QA Guide

Steps to mark a full pass of QA complete.

* Browsers: Chrome, Firefox, Brave, Opera. These are the four the build emits.
* OS: Ubuntu, macOS, Windows
* Load an older build and simulate updating the extension.
* Open the developer console for the service worker and the popup, inspect errors.
* Vault integrity
    * Create vault
    * Log out
    * Log in again
    * Log out
    * Restore from seed
    * Create a second account
    * Import a loose account (not related to the HD wallet)
    * Import an existing vault seed phrase, preferably with test Ether
    * Reveal the seed phrase from Settings, Security & Privacy
* Send Ether
    * By address
    * By ENS name
* Provider stability

  The wallet exposes an EIP-1193 provider and announces itself over EIP-6963 as
  `org.ethcf.wallet`. There is no `window.web3`.

    * Announcement is visible to a dapp that listens for `eip6963:announceProvider`
    * Deploy a contract from a dapp and call its methods
    * Read through events and logs
    * Send a transaction from a dapp
    * Check account balances
    * Run against the bundled test dapp with `yarn dapp`, which serves
      `@metamask/test-dapp` on port 8080
* Token management
    * Add a token by contract address
    * Send that token to another address
    * Confirm the token arrived
* Sign a message for each keyring type, from the test dapp
    * HD keyring
    * Imported keyring
    * Covers `personal_sign` and the `eth_signTypedData` variants
* Change network from mainnet to Sepolia to localhost (Anvil, `yarn anvil:start`)
* Run Anvil with a block time (`ANVIL_ARGS='--block-time 10' yarn anvil:start`) to
  exercise transaction retries
* Copy public key to clipboard
* Export private key
* Confirm the build hash in Settings, About matches `yarn verify-build`

* Explore changes on main, targeting features that have changed and may break.
