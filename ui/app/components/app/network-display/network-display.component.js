import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { getBuiltInNetworkByNetworkId } from '../../../../../app/scripts/controllers/network/enums';
import { getNetworkDisplayName } from '../../../helpers/utils/network-display';

export default class NetworkDisplay extends Component {
  static defaultProps = {
    colored: true,
  };

  static propTypes = {
    colored: PropTypes.bool,
    network: PropTypes.string,
    provider: PropTypes.object,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  render() {
    const { colored, network, provider } = this.props;
    const builtIn = getBuiltInNetworkByNetworkId(network);

    return (
      <div
        className={classnames('network-display__container', {
          'network-display__container--colored': colored,
        })}
        // A light tint of the network's color.
        style={
          colored && builtIn
            ? { backgroundColor: `${builtIn.color}26` }
            : undefined
        }
      >
        {builtIn ? (
          <div
            className="network-display__icon"
            style={{ backgroundColor: builtIn.color }}
          />
        ) : (
          <div
            className="i fa fa-question-circle fa-med"
            style={{
              margin: '0 4px',
              color: 'rgb(125, 128, 130)',
            }}
          />
        )}
        <div className="network-display__name">
          {getNetworkDisplayName(provider, this.context.t)}
        </div>
      </div>
    );
  }
}
