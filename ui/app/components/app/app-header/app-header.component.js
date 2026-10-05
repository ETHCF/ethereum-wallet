import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import { DEFAULT_ROUTE } from '../../../helpers/constants/routes';
import Identicon from '../../ui/identicon';
import MetaFoxLogo from '../../ui/metafox-logo';
import NetworkIndicator from '../network';

export default class AppHeader extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
    network: PropTypes.string,
    provider: PropTypes.object,
    networkDropdownOpen: PropTypes.bool,
    showNetworkDropdown: PropTypes.func,
    hideNetworkDropdown: PropTypes.func,
    toggleAccountMenu: PropTypes.func,
    selectedAddress: PropTypes.string,
    isUnlocked: PropTypes.bool,
    hideNetworkIndicator: PropTypes.bool,
    disabled: PropTypes.bool,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  handleNetworkIndicatorClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const { networkDropdownOpen, showNetworkDropdown, hideNetworkDropdown } =
      this.props;

    if (networkDropdownOpen === false) {
      showNetworkDropdown();
    } else {
      hideNetworkDropdown();
    }
  }

  renderAccountMenu() {
    const { isUnlocked, toggleAccountMenu, selectedAddress, disabled } =
      this.props;

    return (
      isUnlocked && (
        <div
          className={classnames('account-menu__icon', {
            'account-menu__icon--disabled': disabled,
          })}
          onClick={() => {
            if (!disabled) {
              toggleAccountMenu();
            }
          }}
        >
          <Identicon address={selectedAddress} diameter={32} addBorder />
        </div>
      )
    );
  }

  render() {
    const {
      navigate,
      network,
      provider,
      isUnlocked,
      hideNetworkIndicator,
      disabled,
    } = this.props;

    return (
      <div
        className={classnames('app-header', {
          'app-header--back-drop': isUnlocked,
        })}
      >
        <div className="app-header__contents">
          <MetaFoxLogo
            unsetIconHeight
            onClick={() => navigate(DEFAULT_ROUTE)}
          />
          <div className="app-header__account-menu-container">
            {!hideNetworkIndicator && (
              <div className="app-header__network-component-wrapper">
                <NetworkIndicator
                  network={network}
                  provider={provider}
                  onClick={(event) => this.handleNetworkIndicatorClick(event)}
                  disabled={disabled}
                />
              </div>
            )}
            {this.renderAccountMenu()}
          </div>
        </div>
      </div>
    );
  }
}
