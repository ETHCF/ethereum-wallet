import { HELP_ROUTE } from './routes';

// Each topic is a title and its paragraphs, as locale message keys.
export const HELP_TOPICS = {
  'imported-accounts': {
    title: 'helpImportedAccountsTitle',
    paragraphs: [
      'helpImportedAccounts1',
      'helpImportedAccounts2',
      'helpImportedAccounts3',
      'helpImportedAccounts4',
    ],
  },
  'import-json': {
    title: 'helpImportJsonTitle',
    paragraphs: [
      'helpImportJson1',
      'helpImportJson2',
      'helpImportJson3',
      'helpImportJson4',
    ],
  },
  'add-tokens': {
    title: 'helpAddTokensTitle',
    paragraphs: [
      'helpAddTokens1',
      'helpAddTokens2',
      'helpAddTokens3',
      'helpAddTokens4',
    ],
  },
  'safety-tips': {
    title: 'helpSafetyTipsTitle',
    paragraphs: [
      'helpSafetyTips1',
      'helpSafetyTips2',
      'helpSafetyTips3',
      'helpSafetyTips4',
      'helpSafetyTips5',
      'helpSafetyTips6',
    ],
  },
};

/**
 * A link to a help topic in the full-screen view. Every extension page sits next
 * to home.html, so the relative link works from the popup and notification too.
 *
 * @param {string} topic - A key of HELP_TOPICS
 * @returns {string} The URL
 */
export function getHelpUrl(topic) {
  return `home.html#${HELP_ROUTE}/${topic}`;
}
