import React, { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import classnames from 'classnames'

export const HOLD_DURATION_MS = 2000
const HOLD_KEYS = new Set([' ', 'Enter'])

/**
 * A button that fires only after a real pointer or key is held down, so a
 * stray or scripted click cannot reveal a secret.
 */
export default function HoldToRevealButton ({ buttonText, onLongPressed, holdDurationMs = HOLD_DURATION_MS }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef(null)

  const stop = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }, [])

  const start = useCallback((event) => {
    if (!event.isTrusted || timer.current) {
      return
    }
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      onLongPressed()
    }, holdDurationMs)
  }, [holdDurationMs, onLongPressed])

  useEffect(() => stop, [stop])

  return (
    <button
      type="button"
      className={classnames('hold-to-reveal-button', { 'hold-to-reveal-button--holding': holding })}
      style={{ '--hold-duration': `${holdDurationMs}ms` }}
      data-testid="hold-to-reveal-button"
      onPointerDown={(event) => {
        if (event.button === 0) {
          start(event)
        }
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={(event) => {
        if (HOLD_KEYS.has(event.key)) {
          event.preventDefault()
          if (!event.repeat) {
            start(event)
          }
        }
      }}
      onKeyUp={(event) => {
        if (HOLD_KEYS.has(event.key)) {
          stop()
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="hold-to-reveal-button__progress" aria-hidden="true" />
      <span className="hold-to-reveal-button__text">{buttonText}</span>
    </button>
  )
}

HoldToRevealButton.propTypes = {
  buttonText: PropTypes.string.isRequired,
  onLongPressed: PropTypes.func.isRequired,
  holdDurationMs: PropTypes.number,
}
