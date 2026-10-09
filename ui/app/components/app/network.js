import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import NetworkDropdownIcon from './dropdowns/components/network-dropdown-icon';
import { BUILT_IN_NETWORKS } from '../../../../app/scripts/controllers/network/enums';
import { getNetworkDisplayName } from '../../helpers/utils/network-display';

function NetworkIndicator({ disabled, children, hoverText, onClick }) {
  return (
    <div
      className={classnames('network-component pointer', {
        'network-component--disabled': disabled,
      })}
      data-testid="network-display"
      title={hoverText}
      onClick={(event) => {
        if (!disabled) {
          onClick(event);
        }
      }}
    >
      <div className="network-indicator">
        {children}
        <div className="network-indicator__down-arrow" />
      </div>
    </div>
  );
}

NetworkIndicator.propTypes = {
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool,
  hoverText: PropTypes.string,
  onClick: PropTypes.func,
};

export default class Network extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    network: PropTypes.string.isRequired,
    provider: PropTypes.shape({
      type: PropTypes.string,
      nickname: PropTypes.string,
      rpcTarget: PropTypes.string,
    }).isRequired,
    disabled: PropTypes.bool,
    onClick: PropTypes.func.isRequired,
  };

  renderIcon() {
    const { t } = this.context;
    const { network: networkNumber, onClick, provider } = this.props;
    const loading = networkNumber === 'loading';

    const builtIn = BUILT_IN_NETWORKS[provider?.type];
    if (builtIn) {
      return (
        <NetworkDropdownIcon
          backgroundColor={builtIn.color}
          nonSelectBackgroundColor={builtIn.color}
          loading={loading}
        />
      );
    }

    return loading ? (
      <span
        className="pointer network-loading-spinner"
        onClick={(event) => onClick(event)}
      >
        <img title={t('attemptingConnect')} src="images/loading.svg" alt="" />
      </span>
    ) : (
      <i
        className="fa fa-question-circle fa-lg"
        style={{ color: 'rgb(125, 128, 130)' }}
      />
    );
  }

  render() {
    const { disabled, onClick, provider } = this.props;
    const networkName = getNetworkDisplayName(provider, this.context.t);

    return (
      <NetworkIndicator
        disabled={disabled}
        hoverText={networkName}
        onClick={onClick}
      >
        {this.renderIcon()}
        <div className="network-name">{networkName}</div>
      </NetworkIndicator>
    );
  }
}
