import PropTypes from 'prop-types'
import React, { Component } from 'react'
import classnames from 'classnames'
import { BUILT_IN_NETWORKS } from '../../../../app/scripts/controllers/network/enums'
import NetworkDropdownIcon from './dropdowns/components/network-dropdown-icon'

function NetworkIndicator ({ disabled, children, hoverText, onClick }) {
  return (
    <div
      className={classnames('network-component pointer', {
        'network-component--disabled': disabled,
      })}
      data-testid="network-display"
      title={hoverText}
      onClick={(event) => {
        if (!disabled) {
          onClick(event)
        }
      }}
    >
      <div className="network-indicator">
        {children}
        <div className="network-indicator__down-arrow" />
      </div>
    </div>
  )
}

NetworkIndicator.propTypes = {
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool,
  hoverText: PropTypes.string,
  onClick: PropTypes.func,
}

export default class Network extends Component {
  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    network: PropTypes.string.isRequired,
    provider: PropTypes.shape({
      type: PropTypes.string,
      nickname: PropTypes.string,
      rpcTarget: PropTypes.string,
    }).isRequired,
    disabled: PropTypes.bool,
    onClick: PropTypes.func.isRequired,
  }

  render () {
    const {
      t,
    } = this.context

    const {
      disabled,
      network: networkNumber,
      onClick,
      provider,
    } = this.props

    let providerName, providerNick, providerUrl
    if (provider) {
      providerName = provider.type
      providerNick = provider.nickname || ''
      providerUrl = provider.rpcTarget
    }

    const builtIn = BUILT_IN_NETWORKS[providerName]
    if (builtIn) {
      return (
        <NetworkIndicator disabled={disabled} hoverText={builtIn.name} onClick={onClick}>
          <NetworkDropdownIcon
            backgroundColor={builtIn.color}
            nonSelectBackgroundColor={builtIn.color}
            loading={networkNumber === 'loading'}
          />
          <div className="network-name">{builtIn.name}</div>
        </NetworkIndicator>
      )
    }

    return (
      <NetworkIndicator
        disabled={disabled}
        hoverText={providerNick || providerName || providerUrl || null}
        onClick={onClick}
      >
        {
          networkNumber === 'loading'
            ? (
              <span className="pointer network-loading-spinner" onClick={(event) => onClick(event)}>
                <img title={t('attemptingConnect')} src="images/loading.svg" alt="" />
              </span>
            )
            : (
              <i className="fa fa-question-circle fa-lg" style={{ color: 'rgb(125, 128, 130)' }} />
            )
        }
        <div className="network-name">
          {
            providerName === 'localhost'
              ? t('localhost')
              : providerNick || t('privateNetwork')
          }
        </div>
      </NetworkIndicator>
    )
  }
}
