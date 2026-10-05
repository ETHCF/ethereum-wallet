// The build embeds the existing wallet icon in the inpage bundle as text.
import iconSvg from '../../images/logo/ecf-wallet-icon.svg'

const icon = `data:image/svg+xml,${encodeURIComponent(iconSvg)}`

export default function announceProvider (provider) {
  const info = Object.freeze({
    uuid: createUuid(),
    name: 'ECF Wallet',
    icon,
    rdns: 'org.ethcf.wallet',
  })
  const detail = Object.freeze({ info, provider })
  const announce = () => window.dispatchEvent(new window.CustomEvent('eip6963:announceProvider', { detail }))

  // Keep the same identity and provider for early and late listeners on this page.
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
}

function createUuid () {
  // getRandomValues also works on HTTP pages where randomUUID is unavailable.
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  // Set the RFC 4122 version and variant bits.
  // eslint-disable-next-line no-bitwise
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [hex.slice(0, 4), hex.slice(4, 6), hex.slice(6, 8), hex.slice(8, 10), hex.slice(10)]
    .map((part) => part.join('')).join('-')
}
