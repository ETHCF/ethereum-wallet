import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { compose } from 'redux';

import { Dropdown, DropdownMenuItem } from './components/dropdown';
import NetworkDropdownIcon from './components/network-dropdown-icon';
import {
  BUILT_IN_NETWORKS,
  BUILT_IN_NETWORK_TYPES,
} from '../../../../../app/scripts/controllers/network/enums';
import { NETWORKS_ROUTE } from '../../../helpers/constants/routes';
import withRouter from '../../../helpers/higher-order-components/with-router';
import * as actions from '../../../store/actions';

const MAINNET_TYPES = BUILT_IN_NETWORK_TYPES.filter(
  (type) => !BUILT_IN_NETWORKS[type].testnet,
);
const TESTNET_TYPES = BUILT_IN_NETWORK_TYPES.filter(
  (type) => BUILT_IN_NETWORKS[type].testnet,
);
const DROPDOWN_MENU_ITEM_STYLE = {
  fontSize: '16px',
  lineHeight: '20px',
  padding: '12px 0',
};

// classes from nodes of the toggle element.
const notToggleElementClassnames = [
  'menu-icon',
  'network-name',
  'network-indicator',
  'network-caret',
  'network-component',
];

function mapStateToProps(state) {
  return {
    provider: state.ecfWallet.provider,
    frequentRpcListDetail: state.ecfWallet.frequentRpcListDetail || [],
    networkDropdownOpen: state.appState.networkDropdownOpen,
    network: state.ecfWallet.network,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    setProviderType: (type) => {
      dispatch(actions.setProviderType(type));
    },
    setRpcTarget: (target, network, ticker, nickname) => {
      dispatch(actions.setRpcTarget(target, network, ticker, nickname));
    },
    delRpcTarget: (target) => {
      dispatch(actions.delRpcTarget(target));
    },
    hideNetworkDropdown: () => dispatch(actions.hideNetworkDropdown()),
    setNetworksTabAddMode: (isInAddMode) =>
      dispatch(actions.setNetworksTabAddMode(isInAddMode)),
  };
}

class NetworkDropdown extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    provider: PropTypes.shape({
      nickname: PropTypes.string,
      rpcTarget: PropTypes.string,
      type: PropTypes.string,
      ticker: PropTypes.string,
    }).isRequired,
    setProviderType: PropTypes.func.isRequired,
    network: PropTypes.string.isRequired,
    setRpcTarget: PropTypes.func.isRequired,
    hideNetworkDropdown: PropTypes.func.isRequired,
    setNetworksTabAddMode: PropTypes.func.isRequired,
    frequentRpcListDetail: PropTypes.array.isRequired,
    networkDropdownOpen: PropTypes.bool.isRequired,
    navigate: PropTypes.func.isRequired,
    delRpcTarget: PropTypes.func.isRequired,
  };

  handleClick(newProviderType) {
    const { setProviderType } = this.props;

    setProviderType(newProviderType);
  }

  renderCustomOption(provider) {
    const { rpcTarget, type, ticker, nickname } = provider;
    const { network } = this.props;

    if (type !== 'rpc') {
      return null;
    }

    switch (rpcTarget) {
      case 'http://localhost:8545':
        return null;

      default:
        return (
          <DropdownMenuItem
            key={rpcTarget}
            onClick={() =>
              this.props.setRpcTarget(rpcTarget, network, ticker, nickname)
            }
            closeMenu={() => this.props.hideNetworkDropdown()}
            style={{
              fontSize: '16px',
              lineHeight: '20px',
              padding: '12px 0',
            }}
          >
            <i className="fa fa-check" />
            <i className="fa fa-question-circle fa-med menu-icon-circle" />
            <span className="network-name-item">{nickname || rpcTarget}</span>
          </DropdownMenuItem>
        );
    }
  }

  renderCommonRpc(rpcListDetail, provider) {
    const reversedRpcListDetail = rpcListDetail.slice().reverse();

    return reversedRpcListDetail.map((entry) => {
      const rpc = entry.rpcUrl;
      const ticker = entry.ticker || 'ETH';
      const nickname = entry.nickname || '';
      const currentRpcTarget =
        provider.type === 'rpc' && rpc === provider.rpcTarget;

      if (rpc === 'http://localhost:8545' || currentRpcTarget) {
        return null;
      }
      const { chainId } = entry;
      return (
        <DropdownMenuItem
          key={`common${rpc}`}
          closeMenu={() => this.props.hideNetworkDropdown()}
          onClick={() =>
            this.props.setRpcTarget(rpc, chainId, ticker, nickname)
          }
          style={{
            fontSize: '16px',
            lineHeight: '20px',
            padding: '12px 0',
          }}
        >
          {currentRpcTarget ? (
            <i className="fa fa-check" />
          ) : (
            <div className="network-check__transparent">✓</div>
          )}
          <i className="fa fa-question-circle fa-med menu-icon-circle" />
          <span
            className="network-name-item"
            style={{
              color: currentRpcTarget
                ? 'var(--color-text-default)'
                : 'var(--color-text-alternative)',
            }}
          >
            {nickname || rpc}
          </span>
          <i
            className="fa fa-times delete"
            onClick={(e) => {
              e.stopPropagation();
              this.props.delRpcTarget(rpc);
            }}
          />
        </DropdownMenuItem>
      );
    });
  }

  renderBuiltInNetwork(type) {
    const {
      provider: { type: providerType },
    } = this.props;
    const { name, color } = BUILT_IN_NETWORKS[type];
    const isSelected = providerType === type;
    return (
      <DropdownMenuItem
        key={type}
        closeMenu={() => this.props.hideNetworkDropdown()}
        onClick={() => this.handleClick(type)}
        style={DROPDOWN_MENU_ITEM_STYLE}
      >
        {isSelected ? (
          <i className="fa fa-check" />
        ) : (
          <div className="network-check__transparent">✓</div>
        )}
        <NetworkDropdownIcon backgroundColor={color} isSelected={isSelected} />
        <span
          className="network-name-item"
          data-testid={`network-dropdown-${type}`}
          style={{
            color: isSelected
              ? 'var(--color-text-default)'
              : 'var(--color-text-alternative)',
          }}
        >
          {name}
        </span>
      </DropdownMenuItem>
    );
  }

  render() {
    const {
      provider: { type: providerType, rpcTarget: activeNetwork },
      setNetworksTabAddMode,
    } = this.props;
    const rpcListDetail = this.props.frequentRpcListDetail;
    const isOpen = this.props.networkDropdownOpen;
    const dropdownMenuItemStyle = DROPDOWN_MENU_ITEM_STYLE;

    return (
      <Dropdown
        isOpen={isOpen}
        onClickOutside={(event) => {
          const { classList } = event.target;
          const isInClassList = (className) => classList.contains(className);
          const notToggleElementIndex =
            notToggleElementClassnames.findIndex(isInClassList);

          if (notToggleElementIndex === -1) {
            this.props.hideNetworkDropdown();
          }
        }}
        containerClassName="network-droppo"
        zIndex={55}
        style={{
          position: 'absolute',
          top: '58px',
          width: '309px',
          zIndex: '55px',
        }}
        innerStyle={{
          padding: '18px 8px',
          // The built-in list is longer than a popup window is tall.
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
        }}
      >
        <div className="network-dropdown-header">
          <div className="network-dropdown-title">
            {this.context.t('networks')}
          </div>
          <div className="network-dropdown-divider" />
          <div className="network-dropdown-content">
            {this.context.t('defaultNetwork')}
          </div>
        </div>
        {MAINNET_TYPES.map((type) => this.renderBuiltInNetwork(type))}
        <div className="network-dropdown-content network-dropdown-content--section">
          {this.context.t('testNetworks')}
        </div>
        {TESTNET_TYPES.map((type) => this.renderBuiltInNetwork(type))}
        <DropdownMenuItem
          key="default"
          closeMenu={() => this.props.hideNetworkDropdown()}
          onClick={() => this.handleClick('localhost')}
          style={dropdownMenuItemStyle}
        >
          {providerType === 'localhost' ? (
            <i className="fa fa-check" />
          ) : (
            <div className="network-check__transparent">✓</div>
          )}
          <NetworkDropdownIcon
            isSelected={providerType === 'localhost'}
            innerBorder="1px solid var(--color-border-muted)"
          />
          <span
            className="network-name-item"
            style={{
              color:
                providerType === 'localhost'
                  ? 'var(--color-text-default)'
                  : 'var(--color-text-alternative)',
            }}
          >
            {this.context.t('localhost')}
          </span>
        </DropdownMenuItem>
        {this.renderCustomOption(this.props.provider)}
        {this.renderCommonRpc(rpcListDetail, this.props.provider)}
        <DropdownMenuItem
          closeMenu={() => this.props.hideNetworkDropdown()}
          onClick={() => {
            setNetworksTabAddMode(true);
            this.props.navigate(NETWORKS_ROUTE);
          }}
          style={dropdownMenuItemStyle}
        >
          {activeNetwork === 'custom' ? (
            <i className="fa fa-check" />
          ) : (
            <div className="network-check__transparent">✓</div>
          )}
          <NetworkDropdownIcon
            isSelected={activeNetwork === 'custom'}
            innerBorder="1px solid var(--color-border-muted)"
          />
          <span
            className="network-name-item"
            style={{
              color:
                activeNetwork === 'custom'
                  ? 'var(--color-text-default)'
                  : 'var(--color-text-alternative)',
            }}
          >
            {this.context.t('customRPC')}
          </span>
        </DropdownMenuItem>
      </Dropdown>
    );
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(NetworkDropdown);
