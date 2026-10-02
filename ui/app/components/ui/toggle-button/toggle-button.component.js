import React from 'react'
import PropTypes from 'prop-types'

const ToggleButton = (props) => {
  const { value, onToggle, offLabel, onLabel } = props

  const modifier = value ? 'on' : 'off'
  // Called with the current value, as callers expect.
  const toggle = () => onToggle && onToggle(value)

  return (
    <div className={`toggle-button toggle-button--${modifier}`}>
      <div
        className="toggle-button__track"
        role="switch"
        aria-checked={Boolean(value)}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        }}
      >
        <div className="toggle-button__thumb" />
      </div>
      <div className="toggle-button__status">
        <span className="toggle-button__label-off">{offLabel}</span>
        <span className="toggle-button__label-on">{onLabel}</span>
      </div>
    </div>
  )
}

ToggleButton.propTypes = {
  value: PropTypes.bool,
  onToggle: PropTypes.func,
  offLabel: PropTypes.string,
  onLabel: PropTypes.string,
}

export default ToggleButton
