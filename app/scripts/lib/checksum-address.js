import { isValidAddress, toChecksumAddress } from '@ethereumjs/util'

/**
 * Checksums an address, returning anything that is not a 0x-prefixed hex
 * address unchanged. @ethereumjs/util's toChecksumAddress throws for those,
 * and callers here may hold a site's request or a partly typed address.
 *
 * @param {*} address - The value to checksum
 * @returns {*} The checksummed address, or the value unchanged
 */
export function toChecksumHexAddress (address) {
  return typeof address === 'string' && isValidAddress(address) ? toChecksumAddress(address) : address
}
