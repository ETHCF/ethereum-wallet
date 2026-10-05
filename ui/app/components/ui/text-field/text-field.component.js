import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

const TextField = ({
  id,
  label,
  error = null,
  classes,
  className,
  theme = 'bordered',
  margin = 'none',
  fullWidth,
  startAdornment,
  largeLabel,
  disabled,
  onFocus,
  onBlur,
  dir = 'auto',
  ...inputProps
}) => {
  const [focused, setFocused] = useState(false);
  const helperTextId = error && id ? `${id}-helper-text` : undefined;
  // The material theme's label sits inside the empty field and moves above it
  // once the field is focused or holds a value.
  const hasValue = [inputProps.value, inputProps.defaultValue].some(
    (value) => value !== undefined && value !== null && value !== '',
  );
  const labelRaised = theme !== 'material' || focused || hasValue;

  return (
    <div
      className={classnames('text-field', `text-field--${theme}`, className, {
        [`text-field--margin-${margin}`]: margin !== 'none',
        'text-field--full-width': fullWidth,
        'text-field--error': Boolean(error),
        'text-field--disabled': disabled,
        'text-field--with-label': Boolean(label),
      })}
    >
      {label && (
        <label
          htmlFor={id}
          className={classnames('text-field__label', {
            'text-field__label--large': largeLabel,
            'text-field__label--raised': labelRaised,
          })}
        >
          {label}
        </label>
      )}
      <div className={classnames('text-field__input-root', classes?.inputRoot)}>
        {startAdornment && (
          <span className="text-field__adornment">{startAdornment}</span>
        )}
        <input
          id={id}
          className="text-field__input"
          dir={dir}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={helperTextId}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...inputProps}
        />
      </div>
      {error && (
        <p id={helperTextId} className="text-field__helper-text">
          {error}
        </p>
      )}
    </div>
  );
};

TextField.propTypes = {
  id: PropTypes.string,
  label: PropTypes.node,
  error: PropTypes.string,
  // Extra class names; `inputRoot` is added to the element wrapping the input.
  classes: PropTypes.shape({
    inputRoot: PropTypes.string,
  }),
  className: PropTypes.string,
  dir: PropTypes.string,
  theme: PropTypes.oneOf(['bordered', 'material', 'material-white-padded']),
  margin: PropTypes.oneOf(['none', 'dense', 'normal']),
  fullWidth: PropTypes.bool,
  startAdornment: PropTypes.node,
  largeLabel: PropTypes.bool,
  disabled: PropTypes.bool,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
};

export default TextField;
