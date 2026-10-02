import React from 'react'
import PropTypes from 'prop-types'

// The ECF Wallet mark's bars as [x, y, width], each 13.8286 high. They match
// app/images/logo/ecf-wallet-horizontal.svg, which static pages still use.
const BARS = [
  [83.2327, 0.0000, 8.9424],
  [66.4116, 20.7429, 42.1211],
  [49.7229, 41.4857, 75.3481],
  [33.4675, 62.2286, 108.4940],
  [16.7078, 82.9714, 141.6130],
  [0.0000, 103.7143, 174.9560],
  [33.4675, 124.4571, 108.4940],
  [16.5779, 145.2000, 17.3018],
  [58.5510, 145.2000, 58.5542],
  [141.0190, 145.2000, 17.3018],
  [33.4675, 165.9429, 25.0835],
  [115.9360, 165.9429, 26.0264],
  [49.9871, 186.6857, 75.0845],
  [66.2793, 207.4286, 42.1423],
  [83.0715, 228.1714, 9.0833],
]

/**
 * The horizontal ECF Wallet logo. Inline, unlike an <img>, so the name follows
 * the theme's text color and stays readable in dark mode.
 */
const EcfWalletLogo = ({ height, className }) => {
  return (
    <svg
      height={height}
      width={height && (height * 230) / 42}
      className={className}
      viewBox="0 0 230 42"
      role="img"
      aria-label="ECF Wallet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <svg width="42" height="42" viewBox="0 0 256 256">
        <rect width="256" height="256" rx="48" fill="#151a21" />
        <g transform="translate(58 31.2) scale(0.8)" fill="white">
          {BARS.map(([x, y, width]) => (
            <rect key={`${x},${y}`} x={x} y={y} width={width} height="13.8286" />
          ))}
        </g>
      </svg>
      <text
        x="54"
        y="30"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="28"
        fontWeight="600"
        fill="var(--color-text-default)"
      >
        ECF Wallet
      </text>
    </svg>
  )
}

EcfWalletLogo.propTypes = {
  height: PropTypes.number,
  className: PropTypes.string,
}

export default EcfWalletLogo
