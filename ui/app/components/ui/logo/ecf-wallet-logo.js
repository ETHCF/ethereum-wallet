import PropTypes from 'prop-types';
import React from 'react';

// The MetaECF mark's bars as [x, y, width], each 13.8286 high. They match
// app/images/logo/ecf-wallet-horizontal.svg, which static pages still use.
const BARS = [
  [83.2327, 0.0, 8.9424],
  [66.4116, 20.7429, 42.1211],
  [49.7229, 41.4857, 75.3481],
  [33.4675, 62.2286, 108.494],
  [16.7078, 82.9714, 141.613],
  [0.0, 103.7143, 174.956],
  [33.4675, 124.4571, 108.494],
  [16.5779, 145.2, 17.3018],
  [58.551, 145.2, 58.5542],
  [141.019, 145.2, 17.3018],
  [33.4675, 165.9429, 25.0835],
  [115.936, 165.9429, 26.0264],
  [49.9871, 186.6857, 75.0845],
  [66.2793, 207.4286, 42.1423],
  [83.0715, 228.1714, 9.0833],
];

/**
 * The horizontal MetaECF logo. Inline, unlike an <img>, so the name follows
 * the theme's text color and stays readable in dark mode.
 *
 * @param {object} props - The component props.
 * @param {number} [props.height] - The rendered height in pixels; the width
 * follows the logo's aspect ratio.
 * @param {string} [props.className] - Class names for the SVG.
 * @returns {React.ReactElement} The logo SVG.
 */
const EcfWalletLogo = ({ height, className }) => {
  return (
    <svg
      height={height}
      width={height && (height * 180) / 42}
      className={className}
      viewBox="0 0 180 42"
      role="img"
      aria-label="MetaECF"
      xmlns="http://www.w3.org/2000/svg"
    >
      <svg width="42" height="42" viewBox="0 0 256 256">
        <rect width="256" height="256" rx="48" fill="#151a21" />
        <g transform="translate(58 31.2) scale(0.8)" fill="white">
          {BARS.map(([x, y, width]) => (
            <rect
              key={`${x},${y}`}
              x={x}
              y={y}
              width={width}
              height="13.8286"
            />
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
        MetaECF
      </text>
    </svg>
  );
};

EcfWalletLogo.propTypes = {
  height: PropTypes.number,
  className: PropTypes.string,
};

export default EcfWalletLogo;
