import PropTypes from 'prop-types'
import React, { Component } from 'react'
import Button from '../../../ui/button'

export default class DepositEtherModal extends Component {
  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    hideWarning: PropTypes.func.isRequired,
    hideModal: PropTypes.func.isRequired,
    showAccountDetailModal: PropTypes.func.isRequired,
  }

  goToAccountDetailsModal = () => {
    this.props.hideWarning()
    this.props.hideModal()
    this.props.showAccountDetailModal()
  }

  renderRow ({
    logo,
    title,
    text,
    buttonLabel,
    onButtonClick,
    hide,
    className,
    hideButton,
    hideTitle,
    onBackClick,
    showBackButton,
  }) {
    if (hide) {
      return null
    }

    return (
      <div className={className || 'deposit-ether-modal__buy-row'}>
        {onBackClick && showBackButton && (
          <div className="deposit-ether-modal__buy-row__back" onClick={onBackClick}>
            <i className="fa fa-arrow-left cursor-pointer" />
          </div>
        )}
        <div className="deposit-ether-modal__buy-row__logo-container">{logo}</div>
        <div className="deposit-ether-modal__buy-row__description">
          {!hideTitle && (
            <div className="deposit-ether-modal__buy-row__description__title">{title}</div>
          )}
          <div className="deposit-ether-modal__buy-row__description__text">{text}</div>
        </div>
        {!hideButton && (
          <div className="deposit-ether-modal__buy-row__button">
            <Button
              type="secondary"
              className="deposit-ether-modal__deposit-button"
              large
              onClick={onButtonClick}
            >
              {buttonLabel}
            </Button>
          </div>
        )}
      </div>
    )
  }

  render () {
    return (
      <div
        className="page-container page-container--full-width page-container--full-height"
      >
        <div className="page-container__header">
          <div className="page-container__title">
            {this.context.t('depositEther')}
          </div>
          <div className="page-container__subtitle">
            {this.context.t('needEtherInWallet')}
          </div>
          <div
            className="page-container__header-close"
            onClick={() => {
              this.props.hideWarning()
              this.props.hideModal()
            }}
          />
        </div>
        <div className="page-container__content">
          <div className="deposit-ether-modal__buy-rows">
            {this.renderRow({
              logo: (
                <img
                  alt=""
                  className="deposit-ether-modal__logo"
                  src="./images/deposit-eth.svg"
                  style={{
                    height: '75px',
                    width: '75px',
                  }}
                />
              ),
              title: this.context.t('directDepositEther'),
              text: this.context.t('directDepositEtherExplainer'),
              buttonLabel: this.context.t('viewAccount'),
              onButtonClick: () => this.goToAccountDetailsModal(),
            })}
          </div>
        </div>
      </div>
    )
  }
}
