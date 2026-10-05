import classnames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

const CLASSNAME_DEFAULT = 'btn-default';
const CLASSNAME_PRIMARY = 'btn-primary';
const CLASSNAME_SECONDARY = 'btn-secondary';
const CLASSNAME_CONFIRM = 'btn-primary';
const CLASSNAME_RAISED = 'btn-raised';
const CLASSNAME_LARGE = 'btn--large';
const CLASSNAME_ROUNDED = 'btn--rounded';
const CLASSNAME_FIRST_TIME = 'btn--first-time';

const typeHash = {
  default: CLASSNAME_DEFAULT,
  primary: CLASSNAME_PRIMARY,
  secondary: CLASSNAME_SECONDARY,
  warning: 'btn-warning',
  danger: 'btn-danger',
  'danger-primary': 'btn-danger-primary',
  link: 'btn-link',
  // TODO: Legacy button type to be deprecated
  confirm: CLASSNAME_CONFIRM,
  raised: CLASSNAME_RAISED,
  'first-time': CLASSNAME_FIRST_TIME,
};

// A <button> ignores href and target, so a Button given an href renders as a
// link to be followable.
const Button = ({
  type,
  submit,
  large,
  children,
  icon,
  rounded,
  className,
  ...buttonProps
}) => {
  const Tag = buttonProps.href ? 'a' : 'button';

  return (
    <Tag
      type={Tag === 'button' && submit ? 'submit' : undefined}
      className={classnames(
        'button',
        typeHash[type] || CLASSNAME_DEFAULT,
        large && CLASSNAME_LARGE,
        rounded && CLASSNAME_ROUNDED,
        className,
      )}
      {...buttonProps}
    >
      {icon && <span className="button__icon">{icon}</span>}
      {children}
    </Tag>
  );
};

Button.propTypes = {
  type: PropTypes.string,
  submit: PropTypes.bool,
  large: PropTypes.bool,
  rounded: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
  icon: PropTypes.node,
};

Button.defaultProps = {
  submit: false,
};

export default Button;
