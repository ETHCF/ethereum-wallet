/**
 * The `@metamask/providers` package logs and throws messages that name MetaMask, and does not
 * export them for us to replace. Rename the wallet in them as they are bundled.
 * In these files, MetaMask as a whole word appears only in strings and comments.
 *
 * @param {string} source - A @metamask/providers dist file
 * @returns {string} The file with the wallet renamed
 */
module.exports = function rebrandProviderMessages(source) {
  if (!source.includes('MetaMask:') && !source.includes('MetaMask -')) {
    throw new Error(
      `Expected MetaMask messages in ${this.resourcePath}; update rebrand-provider-messages-loader`,
    );
  }
  // Leave links such as github.com/MetaMask/... intact.
  return source.replace(/\bMetaMask\b(?!\/)/gu, 'MetaECF');
};
