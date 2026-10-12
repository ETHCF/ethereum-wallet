/**
 * The key an NFT's downloaded image is stored under, shared by the background
 * and the UI.
 *
 * @param {string} chainId - The NFT's chain ID.
 * @param {string} address - The NFT contract's address.
 * @param {string} tokenId - The NFT's token ID.
 * @returns {string} The key.
 */
export default function nftImageKey(chainId, address, tokenId) {
  return `${chainId}:${address.toLowerCase()}:${tokenId}`;
}
