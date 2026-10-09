import PropTypes from 'prop-types';
import React, { Component } from 'react';

import Button from '../../button';

export default class PageContainerFooter extends Component {
  static propTypes = {
    children: PropTypes.node,
    onCancel: PropTypes.func,
    cancelText: PropTypes.string,
    cancelButtonType: PropTypes.string,
    onSubmit: PropTypes.func,
    submitText: PropTypes.string,
    disabled: PropTypes.bool,
    cancelDisabled: PropTypes.bool,
    cancelTestId: PropTypes.string,
    submitTestId: PropTypes.string,
    submitButtonType: PropTypes.string,
    hideCancel: PropTypes.bool,
    buttonSizeLarge: PropTypes.bool,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  render() {
    const {
      children,
      onCancel,
      cancelText,
      onSubmit,
      submitText,
      disabled,
      cancelDisabled,
      cancelTestId = 'page-container-footer-cancel',
      submitTestId = 'page-container-footer-next',
      submitButtonType,
      hideCancel,
      cancelButtonType,
      buttonSizeLarge = false,
    } = this.props;

    return (
      <div className="page-container__footer">
        <footer>
          {!hideCancel && (
            <Button
              type={cancelButtonType || 'default'}
              large={buttonSizeLarge}
              className="page-container__footer-button"
              disabled={cancelDisabled}
              onClick={(e) => onCancel(e)}
              data-testid={cancelTestId}
            >
              {cancelText || this.context.t('cancel')}
            </Button>
          )}

          <Button
            type={submitButtonType || 'secondary'}
            large={buttonSizeLarge}
            className="page-container__footer-button"
            disabled={disabled}
            onClick={(e) => onSubmit(e)}
            data-testid={submitTestId}
          >
            {submitText || this.context.t('next')}
          </Button>
        </footer>

        {children && (
          <div className="page-container__footer-secondary">{children}</div>
        )}
      </div>
    );
  }
}
