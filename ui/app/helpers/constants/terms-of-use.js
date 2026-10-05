import { TERMS_OF_USE_ROUTE } from './routes';

// The terms are a legal text, so they are kept in English rather than in the
// locale files. Each section is a heading, its paragraphs, and an optional list.
export const TERMS_OF_USE_LAST_UPDATED = 'October 4, 2026';

export const TERMS_OF_USE_SECTIONS = [
  {
    heading: 'Important Terms',
    paragraphs: [
      'These terms include a number of important provisions that affect your rights and responsibilities, such as the disclaimers in Disclaimers, limits on the Ethereum Community Foundation\'s ("ECF", "we" or "us") liability to you in Limits on Liability, your agreement to cover ECF for damages caused by your misuse of the wallet in Your Responsibility, and an agreement to arbitrate disputes in Disputes.',
    ],
  },
  {
    heading: 'Your Permission to Use the Wallet',
    paragraphs: [
      'Subject to these terms, ECF gives you permission to use ECF Wallet, the browser extension that lets you manage Ethereum accounts and interact with the Ethereum blockchain (the "wallet"). Everyone needs to agree to these terms to use the wallet.',
    ],
  },
  {
    heading: 'Conditions for Use of the Wallet',
    paragraphs: [
      'Your permission to use the wallet is subject to the following conditions:',
    ],
    items: [
      'You must be at least thirteen years old, and old enough to enter into a binding agreement where you live.',
      'You may no longer use the wallet if ECF contacts you directly to say that you may not.',
      'You must use the wallet in accordance with Acceptable Use.',
    ],
  },
  {
    heading: 'Acceptable Use',
    paragraphs: ['You may not:'],
    items: [
      'Break the law, or use the wallet to send funds that are the proceeds of crime or to finance illegal activity.',
      'Use the wallet to access accounts, keys or funds that are not yours without permission.',
      'Falsely imply that you are employed by, affiliated with, or endorsed by ECF.',
      'Distribute modified copies of the wallet under the ECF Wallet name, or in a way that suggests they come from ECF.',
      'Remove any marks showing proprietary ownership from materials included with the wallet.',
      "Break or circumvent any security feature of the wallet, or attempt to obtain another user's keys or seed phrase.",
      'Impersonate others through the wallet, including when requesting signatures or transactions.',
      'Encourage or help anyone in violation of these terms.',
    ],
  },
  {
    heading: 'Your Keys and Funds',
    paragraphs: [
      'ECF Wallet is a self-custodial wallet. Your seed phrase, private keys and password are created and stored only on your device. ECF never receives them, cannot see them, and cannot recover them if you lose them.',
      'You are solely responsible for keeping your seed phrase, private keys and password secret and backed up, and for all activity that uses them. Anyone who obtains your seed phrase or private keys can take your funds.',
      'Transactions you sign are broadcast to public blockchain networks and are final. ECF cannot cancel, reverse or refund a transaction, and does not control the networks, tokens, websites or smart contracts you interact with.',
    ],
  },
  {
    heading: 'Third-Party Services',
    paragraphs: [
      'The wallet connects to services run by others, including Ethereum RPC providers, ENS gateways, hardware wallet services and the websites you choose to connect. Those services see the requests the wallet makes to them and are governed by their own terms. ECF does not control them and is not responsible for their availability, accuracy or conduct.',
    ],
  },
  {
    heading: 'Enforcement',
    paragraphs: [
      'ECF may investigate and prosecute violations of these terms to the fullest legal extent. ECF may notify and cooperate with law enforcement authorities in prosecuting violations of the law and these terms.',
      'If you believe someone is using the wallet or the ECF Wallet name in violation of these terms, please let us know.',
    ],
  },
  {
    heading: 'Your Responsibility',
    paragraphs: [
      "You agree to indemnify ECF from legal claims by others related to your breach of these terms, or breach of these terms by others using your accounts or keys. Both you and ECF agree to notify the other side of any legal claims you might have to indemnify ECF for as soon as possible. If ECF fails to notify you of a legal claim promptly, you won't have to indemnify ECF for damages that you could have defended against or mitigated with prompt notice. You agree to allow ECF to control investigation, defense and settlement of legal claims you would have to indemnify ECF for, and to cooperate with those efforts. ECF agrees not to agree to any settlement that admits fault for you or imposes obligations on you without your prior agreement.",
    ],
  },
  {
    heading: 'Disclaimers',
    paragraphs: [
      'You accept all risk of using the wallet, including the risk of losing funds through lost keys, mistaken transactions, malicious websites or contracts, network failures and software defects. As far as the law allows, ECF and its suppliers provide the wallet as is, without any warranty whatsoever.',
      'The wallet may link to and integrate with websites and services run by others. ECF makes no warranty about services run by others, or content they may provide. Use of services run by others may be governed by other terms between you and the one running the service.',
      'Nothing in the wallet is financial, investment, legal or tax advice.',
    ],
  },
  {
    heading: 'Limits on Liability',
    paragraphs: [
      'Neither ECF nor its suppliers will be liable to you for breach-of-contract damages their personnel could not have reasonably foreseen when you agreed to these terms.',
      'As far as the law allows, the total liability to you for claims of any kind that are related to the wallet will be limited to $50.',
    ],
  },
  {
    heading: 'Feedback',
    paragraphs: [
      "ECF welcomes your feedback and suggestions for the wallet. You agree that ECF will be free to act on feedback and suggestions you provide, and that ECF won't have to notify you that your feedback was used, get your permission to use it, or pay you. You agree not to submit feedback or suggestions that you believe might be confidential or proprietary, to you or others.",
    ],
  },
  {
    heading: 'Termination',
    paragraphs: [
      'Either you or ECF may end the agreement written out in these terms at any time. You can end it by uninstalling the wallet. When our agreement ends, your permission to use the wallet also ends. Removing the wallet from your browser deletes its copy of your keys, so make sure you have your seed phrase backed up before you uninstall.',
      'The following provisions survive the end of our agreement: Your Keys and Funds, Feedback, Your Responsibility, Disclaimers, Limits on Liability, and General Terms.',
    ],
  },
  {
    heading: 'Disputes',
    paragraphs: [
      'The law of the State of New York will govern any dispute related to these terms or your use of the wallet.',
      'You and ECF agree to seek injunctions related to these terms only in state or federal court in Brooklyn, New York. Neither you nor ECF will object to jurisdiction, forum or venue in those courts.',
      "Other than to seek an injunction or for claims under the Computer Fraud and Abuse Act, you and ECF will resolve any dispute by binding American Arbitration Association arbitration. Arbitration will follow the AAA's Commercial Arbitration Rules and Supplementary Procedures for Consumer Related Disputes. Arbitration will happen in Brooklyn, New York. You will settle any dispute as an individual, and not as part of a class action or other representative proceeding, whether as the plaintiff or a class member. No arbitrator will consolidate any dispute with any other arbitration without ECF's permission.",
      "Any arbitration award will include costs of the arbitration, reasonable attorneys' fees and reasonable costs for witnesses. You and ECF may enter arbitration awards in any court with jurisdiction.",
    ],
  },
  {
    heading: 'General Terms',
    paragraphs: [
      'If a provision of these terms is unenforceable as written, but could be changed to make it enforceable, that provision should be modified to the minimum extent necessary to make it enforceable. Otherwise, that provision should be removed.',
      'You may not assign your agreement with ECF. ECF may assign your agreement to any affiliate, any other company that obtains control of ECF, or any other company that buys assets of ECF related to the wallet. Any attempted assignment against these terms has no legal effect.',
      'Neither the exercise of any right under this agreement, nor waiver of any breach of this agreement, waives any other breach of this agreement.',
      'These terms embody all the terms of agreement between you and ECF about use of the wallet. These terms entirely replace any other agreements about your use of the wallet, written or not.',
      "The wallet's source code is published separately under its own open-source license, and nothing in these terms limits your rights under that license.",
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'You may notify ECF under these terms, and send questions to ECF, by opening an issue at https://github.com/ETHCF/ethereum-wallet/issues or through https://ethcf.org/.',
      'ECF may notify you under these terms through the wallet itself or by posting on https://ethcf.org/.',
    ],
  },
  {
    heading: 'Changes',
    paragraphs: [
      "ECF may update the terms of use. Updated terms ship with new versions of the wallet and are published in its source repository. Once you get notice of an update, it is effective when you next use the wallet. If you don't agree to the update, you must stop using the wallet.",
    ],
  },
];

/**
 * A link to the terms in the full-screen view. Every extension page sits next to
 * home.html, so the relative link works from the popup and onboarding too.
 *
 * @returns {string} The URL
 */
export function getTermsOfUseUrl() {
  return `home.html#${TERMS_OF_USE_ROUTE}`;
}
