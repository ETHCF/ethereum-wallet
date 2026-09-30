# Using the Trezor emulator

Use the current [Trezor emulator documentation](https://docs.trezor.io/trezor-firmware/core/emulator/index.html)
and [build instructions](https://docs.trezor.io/trezor-firmware/core/build/emulator.html).
The firmware now lives in the `trezor-firmware` repository; the old `trezor-core`
checkout and `emu.sh` instructions no longer apply. Trezor's docs also link to
Trezor User Env for running an emulator without modifying firmware.

Build this extension with `yarn build:test`, load the unpacked build, and choose
Trezor in **Connect Hardware Wallet**. Keep the extension's hardware connection
tab open. Device selection and permissions are handled by the Trezor Connect
popup. Configure the emulator and its Bridge connection using the upstream
instructions for your platform, and use a disposable test seed.

This branch uses `@metamask/eth-trezor-keyring` 11 and Connect Web 9.7.3. Connect
Web 10 is a separate major release; it is not substituted underneath the keyring's
supported 9.x dependency. Popup and USB permission scripts come from that same
installed 9.x package during the build.

Before release, verify account discovery, passphrase accounts, personal signing,
EIP-712 V4 signing, custom-chain transactions, device rejection, disconnect and
reconnect, wallet lock, and a browser restart with physical devices too. Emulator
and mocked-transport tests do not establish physical-device compatibility.
