import PropTypes from 'prop-types';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopper } from 'react-popper';

// How long an interactive tooltip stays open after the pointer leaves the
// trigger, so the pointer can move onto the tooltip.
const INTERACTIVE_HIDE_DELAY_MS = 150;

/**
 * A tooltip shown while its trigger is hovered or focused, positioned with
 * Popper.
 *
 * @param {object} props - The props.
 * @param {React.ReactNode} props.children - The trigger.
 * @param {string} [props.containerClassName] - Class for the trigger element.
 * @param {boolean} [props.disabled] - Never show the tooltip.
 * @param {React.ReactNode} [props.html] - Rich tooltip content.
 * @param {boolean} [props.interactive] - Let the pointer move onto the
 * tooltip, for content with links.
 * @param {number} [props.offset] - Shift along the trigger's edge, in pixels.
 * @param {Function} [props.onHidden] - Called each time the tooltip hides.
 * @param {string} [props.position] - Side of the trigger to show it on.
 * @param {object} [props.style] - Style for the trigger element.
 * @param {string} [props.title] - Plain-text tooltip content.
 * @param {string} [props.wrapperClassName] - Class for the outer element.
 * @returns {React.ReactElement} The trigger, with its tooltip while shown.
 */
export default function Tooltip({
  children = null,
  containerClassName = '',
  disabled = false,
  html = null,
  interactive = false,
  offset = 0,
  onHidden = undefined,
  position = 'left',
  style = undefined,
  title = null,
  wrapperClassName = undefined,
}) {
  const tooltipId = useId();
  const [referenceElement, setReferenceElement] = useState(null);
  const [popperElement, setPopperElement] = useState(null);
  const [arrowElement, setArrowElement] = useState(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);
  const wasVisible = useRef(false);

  const { styles, attributes, update } = usePopper(
    referenceElement,
    popperElement,
    {
      placement: position,
      modifiers: [
        { name: 'offset', options: { offset: [offset, 10] } },
        { name: 'arrow', options: { element: arrowElement, padding: 9 } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ],
    },
  );

  const hasContent = Boolean(title || html);
  const shown = visible && hasContent && !disabled;

  // Content such as "Copied!" can change while the tooltip is open.
  useEffect(() => {
    if (shown && update) {
      update();
    }
  }, [shown, title, html, update]);

  useEffect(() => {
    if (wasVisible.current && !shown) {
      onHidden?.();
    }
    wasVisible.current = shown;
  }, [shown, onHidden]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!hasContent) {
    return <div className={wrapperClassName}>{children}</div>;
  }

  const show = () => {
    clearTimeout(hideTimer.current);
    setVisible(true);
  };
  const hide = () => {
    clearTimeout(hideTimer.current);
    if (interactive) {
      hideTimer.current = setTimeout(
        () => setVisible(false),
        INTERACTIVE_HIDE_DELAY_MS,
      );
    } else {
      setVisible(false);
    }
  };

  return (
    <div className={wrapperClassName}>
      <div
        ref={setReferenceElement}
        className={containerClassName}
        style={{ display: 'inline', ...style }}
        aria-describedby={shown ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {shown &&
        createPortal(
          <div
            ref={setPopperElement}
            id={tooltipId}
            role="tooltip"
            className="tooltip"
            data-interactive={interactive || undefined}
            style={styles.popper}
            {...attributes.popper}
            onMouseEnter={interactive ? show : undefined}
            onMouseLeave={interactive ? hide : undefined}
          >
            <div className="tooltip__content">{html || title}</div>
            <div
              ref={setArrowElement}
              className="tooltip__arrow"
              style={styles.arrow}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

Tooltip.propTypes = {
  children: PropTypes.node,
  containerClassName: PropTypes.string,
  disabled: PropTypes.bool,
  html: PropTypes.node,
  interactive: PropTypes.bool,
  offset: PropTypes.number,
  onHidden: PropTypes.func,
  position: PropTypes.oneOf(['top', 'right', 'bottom', 'left']),
  style: PropTypes.object,
  title: PropTypes.string,
  wrapperClassName: PropTypes.string,
};
