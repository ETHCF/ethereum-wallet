/**
 * Gives the caller a testnet faucet URL, depending on the network they are in.
 *
 * @param {Object} opts - Options required to determine the correct url
 * @param {string} opts.network The network for which to return a url
 * @param {string} [opts.service] The faucet to use instead of the network default
 * @returns {string} The URL at which the user can access test ETH
 * @throws {Error} If the service or network has no supported faucet
 *
 */
export default function getBuyEthUrl ({ network, service }) {
  // default service by network if not specified
  if (!service) {
    // eslint-disable-next-line no-param-reassign
    service = getDefaultServiceForNetwork(network)
  }

  switch (service) {
    case 'metamask-faucet':
      return 'https://faucet.metamask.io/'
    case 'rinkeby-faucet':
      return 'https://www.rinkeby.io/'
    case 'kovan-faucet':
      return 'https://github.com/kovan-testnet/faucet'
    case 'goerli-faucet':
      return 'https://goerli-faucet.slock.it/'
    default:
      throw new Error(`Unknown faucet: "${service}"`)
  }
}

function getDefaultServiceForNetwork (network) {
  switch (network) {
    case '3':
      return 'metamask-faucet'
    case '4':
      return 'rinkeby-faucet'
    case '42':
      return 'kovan-faucet'
    case '5':
      return 'goerli-faucet'
    default:
      throw new Error(`No default faucet for networkId: "${network}"`)
  }
}
