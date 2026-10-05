import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopper } from 'react-popper';

const Menu = ({
  anchorElement,
  children,
  className,
  onHide,
  popperOptions,
}) => {
  const [popperElement, setPopperElement] = useState(null);
  const [popoverContainerElement] = useState(() =>
    document.getElementById('popover-content'),
  );

  const { attributes, styles } = usePopper(
    anchorElement,
    popperElement,
    popperOptions,
  );

  return createPortal(
    <>
      <div className="menu__background" onClick={onHide} />
      <div
        className={classnames('menu__container', className)}
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
      >
        {children}
      </div>
    </>,
    popoverContainerElement,
  );
};

Menu.propTypes = {
  anchorElement: PropTypes.instanceOf(window.Element),
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  onHide: PropTypes.func.isRequired,
  popperOptions: PropTypes.object,
};

Menu.defaultProps = {
  anchorElement: undefined,
  className: undefined,
  popperOptions: undefined,
};

export default Menu;
