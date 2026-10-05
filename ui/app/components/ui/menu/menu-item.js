import classnames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

const MenuItem = ({
  children,
  className,
  'data-testid': dataTestId,
  iconClassName,
  onClick,
  subtitle,
}) => (
  <button
    className={classnames('menu-item', className)}
    data-testid={dataTestId}
    onClick={onClick}
  >
    {iconClassName ? (
      <i className={classnames('menu-item__icon', iconClassName)} />
    ) : null}
    <span>{children}</span>
    {subtitle}
  </button>
);

MenuItem.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  'data-testid': PropTypes.string,
  iconClassName: PropTypes.string,
  onClick: PropTypes.func,
  subtitle: PropTypes.node,
};

MenuItem.defaultProps = {
  className: undefined,
  'data-testid': undefined,
  iconClassName: undefined,
  onClick: undefined,
  subtitle: undefined,
};

export default MenuItem;
