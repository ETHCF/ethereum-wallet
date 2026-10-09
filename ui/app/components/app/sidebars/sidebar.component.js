import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';

import CustomizeGas from '../gas-customization/gas-modal-page-container';

export default class Sidebar extends Component {
  static propTypes = {
    sidebarOpen: PropTypes.bool,
    hideSidebar: PropTypes.func,
    transitionName: PropTypes.string,
    type: PropTypes.string,
    sidebarProps: PropTypes.object,
  };

  renderOverlay() {
    return (
      <div
        className="sidebar-overlay"
        onClick={() => this.props.hideSidebar()}
      />
    );
  }

  renderSidebarContent() {
    const { type, sidebarProps = {} } = this.props;
    const { transaction = {} } = sidebarProps;
    switch (type) {
      case 'customize-gas':
        return (
          <div className="sidebar-left">
            <CustomizeGas transaction={transaction} />
          </div>
        );
      default:
        return null;
    }
  }

  render() {
    const { transitionName, sidebarOpen } = this.props;
    const content = sidebarOpen ? this.renderSidebarContent() : null;

    return (
      <div>
        <TransitionGroup>
          {content && (
            <CSSTransition
              key="sidebar"
              classNames={transitionName}
              timeout={{ enter: 300, exit: 200 }}
            >
              {content}
            </CSSTransition>
          )}
        </TransitionGroup>
        {sidebarOpen ? this.renderOverlay() : null}
      </div>
    );
  }
}
