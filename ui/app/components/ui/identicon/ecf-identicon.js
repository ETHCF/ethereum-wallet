import React from 'react'
import PropTypes from 'prop-types'
import classnames from 'classnames'

const GRID = 5
// Only the left half plus the centre column are derived; the rest mirrors.
const UNIQUE_COLUMNS = Math.ceil(GRID / 2)

/**
 * A deterministic identicon drawn as a mirrored grid of squares in the
 * foreground colour. Same job as a jazzicon, without introducing colour the
 * rest of the interface does not use.
 *
 * @param {Object} props
 * @param {string} props.address - The account or contract address.
 * @param {number} props.diameter - Rendered width and height in pixels.
 * @param {string} [props.className] - Additional class names.
 */
export default function EcfIdenticon ({ address, diameter, className }) {
  const hex = String(address || '').replace(/^0x/u, '').toLowerCase()
  const cells = []

  if (hex.length) {
    for (let column = 0; column < UNIQUE_COLUMNS; column++) {
      for (let row = 0; row < GRID; row++) {
        const nibble = parseInt(hex[((column * GRID) + row) % hex.length], 16)
        if (!Number.isFinite(nibble) || nibble % 2 === 0) {
          continue
        }
        cells.push([column, row])
        const mirrored = GRID - 1 - column
        if (mirrored !== column) {
          cells.push([mirrored, row])
        }
      }
    }
  }

  return (
    <svg
      className={classnames('identicon', className)}
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${GRID} ${GRID}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {cells.map(([column, row]) => (
        <rect
          key={`${column}-${row}`}
          x={column}
          y={row}
          width="1"
          height="1"
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

EcfIdenticon.defaultProps = {
  className: undefined,
}

EcfIdenticon.propTypes = {
  address: PropTypes.string.isRequired,
  diameter: PropTypes.number.isRequired,
  className: PropTypes.string,
}
