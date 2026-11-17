## Add Custom Build to Edge

1. Run `yarn dist` from the repository root.
2. Open `edge://extensions/` and turn on **Developer mode** (left sidebar).
3. Click **Load unpacked**.
4. Select the repository's `dist/edge` folder, which contains `manifest.json`.

The `builds` folder contains ZIP archives, not an unpacked extension. Selecting
`builds` or `dist` itself causes “Manifest file is missing or unreadable”.
Alternatively, extract `builds/ecf-wallet-edge-<version>.zip` into a separate
folder and select the extracted folder containing `manifest.json`.

After rebuilding, click **Reload** on the extension's card. To inspect the
background console, click the **service worker** link on that card.

Dev and test builds carry the Chrome Web Store key, so an unpacked build in
Edge gets the Chrome extension ID, not the Edge Add-ons ID.
