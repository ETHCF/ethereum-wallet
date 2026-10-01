import { getAddressExplorerUrl } from '../../app/scripts/lib/block-explorer'

export default function getAccountLink (address, network, rpcPrefs) {
  return getAddressExplorerUrl(address, network, rpcPrefs)
}
