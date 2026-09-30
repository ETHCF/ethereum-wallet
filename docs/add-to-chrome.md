## Add Custom Build to Chrome

1. Run `yarn dist` from the repository root.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `dist/chrome` folder, which contains `manifest.json`.

The `builds` folder contains ZIP archives, not an unpacked extension. Selecting
`builds` or `dist` itself causes “Manifest file is missing or unreadable”.
Alternatively, extract `builds/ecf-wallet-chrome-1.0.0.zip` into a separate folder
and select the extracted folder containing `manifest.json`.

After rebuilding, click **Reload** on the extension's card. To inspect the
background console, click the **service worker** link on that card.
