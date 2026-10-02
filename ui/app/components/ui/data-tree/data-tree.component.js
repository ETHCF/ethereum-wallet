import React from 'react'
import PropTypes from 'prop-types'

const isBranch = (value) => value !== null && typeof value === 'object'

const formatLeaf = (value) => (typeof value === 'string' ? value : JSON.stringify(value))

/**
 * Shows nested data, such as a typed-data message, as a collapsible tree.
 * Values render as text, so data from a site cannot inject markup.
 */
export default function DataTree ({ data, name, expandLevel, level }) {
  if (!isBranch(data)) {
    return (
      <div className="data-tree__row">
        {name !== undefined && <span className="data-tree__key">{`${name}: `}</span>}
        <span className="data-tree__value">{formatLeaf(data)}</span>
      </div>
    )
  }
  const entries = Array.isArray(data) ? data.map((value, index) => [String(index), value]) : Object.entries(data)
  const summary = Array.isArray(data) ? `Array(${data.length})` : 'Object'
  return (
    <details className="data-tree" open={level < expandLevel}>
      <summary className="data-tree__summary">
        {name !== undefined && <span className="data-tree__key">{`${name}: `}</span>}
        <span className="data-tree__type">{summary}</span>
      </summary>
      <div className="data-tree__children">
        {entries.map(([key, value]) => (
          <DataTree key={key} data={value} name={key} expandLevel={expandLevel} level={level + 1} />
        ))}
      </div>
    </details>
  )
}

DataTree.propTypes = {
  data: PropTypes.any,
  name: PropTypes.string,
  // Levels shown open at first; deeper levels start collapsed.
  expandLevel: PropTypes.number,
  level: PropTypes.number,
}

DataTree.defaultProps = {
  expandLevel: 1,
  level: 0,
}
