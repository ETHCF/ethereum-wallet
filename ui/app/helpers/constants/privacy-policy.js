import { PRIVACY_POLICY_ROUTE } from './routes';

// Like the terms of use, the policy is a legal text kept in English rather than
// in the locale files. It describes what the code does, so update it alongside
// any change that stores new data or contacts a new service.
export const PRIVACY_POLICY_LAST_UPDATED = 'October 4, 2026';

export const PRIVACY_POLICY_SECTIONS = [
  {
    heading: 'Summary',
    paragraphs: [
      'ECF Wallet is a self-custodial browser extension published by the Ethereum Community Foundation ("ECF", "we" or "us"). ECF does not run a server that the wallet reports to. There are no ECF accounts, no usage analytics and no crash reports. What the wallet stores stays in your browser.',
      'To work, the wallet has to talk to blockchain networks and a few other services run by third parties. This policy lists each of them and what they can see.',
    ],
  },
  {
    heading: 'Information Stored on Your Device',
    paragraphs: [
      "The wallet keeps the following in your browser's extension storage. ECF never receives it.",
    ],
    items: [
      'Your seed phrase and private keys, encrypted with your password.',
      'Your account addresses and names, imported and hardware wallet accounts, and your address book.',
      'Tokens you have added, networks you have added, and the history of transactions and signature requests made through the wallet.',
      'The websites you have connected and the accounts each one may see.',
      'Your settings, such as language, theme, auto-lock time, IPFS gateway and phishing detection.',
    ],
  },
  {
    heading: 'While the Wallet Is Unlocked',
    paragraphs: [
      "When you unlock the wallet, the key that decrypts your vault is kept in the browser's memory-only session storage, so the wallet stays unlocked while the browser restarts its background process. It is removed when the wallet locks or the browser closes, and is never written to disk.",
      'When you copy your seed phrase or a private key, the wallet clears your clipboard about a minute later.',
    ],
  },
  {
    heading: 'Information We Do Not Collect',
    paragraphs: [
      'The wallet does not collect usage events, does not send crash or error reports, and does not create an identifier for you or your device. It does not fetch token prices or fiat conversion rates, and does not look up your transaction history from a block explorer. Errors are shown only in your browser.',
    ],
  },
  {
    heading: 'Services the Wallet Contacts',
    paragraphs: [
      'Every service below sees your IP address and the content of the requests the wallet sends it, and handles them under its own privacy policy. ECF does not receive copies of these requests.',
    ],
    items: [
      "Blockchain networks. To show balances and send transactions, the wallet sends requests, including your account addresses and the transactions you sign, to the selected network's RPC endpoint. Ethereum Mainnet uses PublicNode, and falls back to dRPC, 1RPC and Blast when PublicNode cannot be reached. The other built-in networks use PublicNode (Sepolia and Polygon) or the network's own public endpoint (Arbitrum, Optimism, Base and Robinhood Chain). If you add a network or choose your own RPC endpoint, requests go there instead.",
      'Phishing list. About once an hour the wallet downloads the eth-phishing-detect blocklist from jsDelivr. The sites you visit are checked against it on your device; your browsing is not sent anywhere. The list is downloaded even if you turn phishing detection off.',
      "Contract method names. When a transaction calls a contract function the wallet does not recognize, it looks up the function's 4-byte identifier at 4byte.directory to show you its name.",
      'ENS websites. When you visit a .eth address on Ethereum Mainnet, the wallet looks up the name through your RPC endpoint and then loads the site through your IPFS gateway (dweb.link unless you change it), a Swarm gateway, or app.ens.domains.',
      'Networks requested by websites. When a site asks to add a network, the wallet asks the proposed RPC endpoint for its chain ID before showing you the request.',
      'Hardware wallets. Trezor devices are reached through Trezor Connect (connect.trezor.io), which is run by Trezor. Ledger devices are reached directly over WebHID.',
    ],
  },
  {
    heading: 'Websites You Use',
    paragraphs: [
      'The wallet adds an Ethereum provider to the web pages you visit so that sites can find it. A site learns your account address only after you approve a connection, and learns about a transaction or signature only when you approve it. You can see and remove connected sites in the wallet at any time.',
      'ethcf.org and other browser extensions can also send the wallet requests. They are treated like any other website and need the same approvals.',
      'Links to block explorers, such as Etherscan, and to other websites open only when you click them.',
    ],
  },
  {
    heading: 'Public Blockchains',
    paragraphs: [
      'Transactions you send are recorded on a public blockchain. Anyone can see your address, its balance and its transaction history, and that record cannot be changed or deleted by you or by ECF.',
    ],
  },
  {
    heading: 'Browser Permissions',
    paragraphs: ['The wallet asks your browser for these permissions:'],
    items: [
      'Access to the websites you visit, to provide the Ethereum provider and to warn you about known phishing sites.',
      'Storage, to keep your encrypted wallet and settings.',
      'Web requests, to notice when a .eth address fails to load so it can resolve the name.',
      'Notifications, to tell you when a transaction is confirmed or fails.',
      'Clipboard writing and an offscreen document, to copy addresses and to clear copied secrets.',
      'Alarms, to lock the wallet automatically and to check on pending transactions.',
    ],
  },
  {
    heading: 'Your Choices',
    paragraphs: [
      'You can choose your own RPC endpoints and IPFS gateway in Settings, turn off phishing detection, and disconnect websites. Uninstalling the wallet deletes everything it stored in your browser, so back up your seed phrase first. ECF holds no copy of your data, so there is nothing for us to access, correct or delete on your behalf.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: ['The wallet is not directed to children under thirteen.'],
  },
  {
    heading: 'Changes',
    paragraphs: [
      'If the wallet starts storing or sending different information, we will update this policy. Updated policies ship with new versions of the wallet and are published in its source repository, and the date at the top shows when it last changed.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'Send privacy questions to ECF by opening an issue at https://github.com/ETHCF/ethereum-wallet/issues or through https://ethcf.org/.',
    ],
  },
];

/**
 * A link to the policy in the full-screen view. Every extension page sits next
 * to home.html, so the relative link works from the popup and onboarding too.
 *
 * @returns {string} The URL
 */
export function getPrivacyPolicyUrl() {
  return `home.html#${PRIVACY_POLICY_ROUTE}`;
}
