import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import Button from '../../../components/ui/button';
import LogoLedger from '../../../components/ui/logo/logo-ledger';
import LogoTrezor from '../../../components/ui/logo/logo-trezor';

export default class SelectHardware extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    connectToHardwareWallet: PropTypes.func.isRequired,
    browserSupported: PropTypes.bool.isRequired,
  };

  state = {
    selectedDevice: null,
  };

  connect = () => {
    if (this.state.selectedDevice) {
      this.props.connectToHardwareWallet(this.state.selectedDevice);
    }
    return null;
  };

  renderConnectToTrezorButton() {
    return (
      <button
        className={classnames('hw-connect__btn', {
          selected: this.state.selectedDevice === 'trezor',
        })}
        onClick={(_) => this.setState({ selectedDevice: 'trezor' })}
      >
        <LogoTrezor className="hw-connect__btn__img" ariaLabel="Trezor" />
      </button>
    );
  }

  renderConnectToLedgerButton() {
    return (
      <button
        className={classnames('hw-connect__btn', {
          selected: this.state.selectedDevice === 'ledger',
        })}
        onClick={(_) => this.setState({ selectedDevice: 'ledger' })}
      >
        <LogoLedger className="hw-connect__btn__img" ariaLabel="Ledger" />
      </button>
    );
  }

  renderButtons() {
    return (
      <>
        <div className="hw-connect__btn-wrapper">
          {this.renderConnectToLedgerButton()}
          {this.renderConnectToTrezorButton()}
        </div>
        <Button
          type="primary"
          large
          className="hw-connect__connect-btn"
          onClick={this.connect}
          disabled={!this.state.selectedDevice}
        >
          {this.context.t('connect')}
        </Button>
      </>
    );
  }

  renderUnsupportedBrowser() {
    return (
      <div className="new-external-account-form unsupported-browser">
        <div className="hw-connect">
          <h3 className="hw-connect__title">
            {this.context.t('browserNotSupported')}
          </h3>
          <p className="hw-connect__msg">
            {this.context.t('chromeRequiredForHardwareWallets')}
          </p>
        </div>
        <Button
          type="primary"
          large
          onClick={() =>
            global.platform.openTab({
              url: 'https://google.com/chrome',
            })
          }
        >
          {this.context.t('downloadGoogleChrome')}
        </Button>
      </div>
    );
  }

  renderHeader() {
    return (
      <div className="hw-connect__header">
        <h3 className="hw-connect__header__title">
          {this.context.t('hardwareWallets')}
        </h3>
        <p className="hw-connect__header__msg">
          {this.context.t('hardwareWalletsMsg')}
        </p>
      </div>
    );
  }

  getAffiliateLinks() {
    const links = {
      trezor: `<a class='hw-connect__get-hw__link' href='https://shop.trezor.io/' target='_blank'>Trezor</a>`,
      ledger: `<a class='hw-connect__get-hw__link' href='https://www.ledger.com/products/ledger-nano-s?r=17c4991a03fa&tracker=MY_TRACKER' target='_blank'>Ledger</a>`,
    };

    const text = this.context.t('orderOneHere');
    const response = text
      .replace('Trezor', links.trezor)
      .replace('Ledger', links.ledger);

    return (
      <div
        className="hw-connect__get-hw__msg"
        dangerouslySetInnerHTML={{ __html: response }}
      />
    );
  }

  renderTrezorAffiliateLink() {
    return (
      <div className="hw-connect__get-hw">
        <p className="hw-connect__get-hw__msg">
          {this.context.t('dontHaveAHardwareWallet')}
        </p>
        {this.getAffiliateLinks()}
      </div>
    );
  }

  renderTutorialSteps() {
    const steps = [
      {
        title: this.context.t('step1HardwareWallet'),
        message: this.context.t('step1HardwareWalletMsg'),
      },
      {
        title: this.context.t('step2HardwareWallet'),
        message: this.context.t('step2HardwareWalletMsg'),
      },
      {
        title: this.context.t('step3HardwareWallet'),
        message: this.context.t('step3HardwareWalletMsg'),
      },
    ];

    return (
      <div className="hw-tutorial">
        {steps.map((step, index) => (
          <div className="hw-connect" key={index}>
            <h3 className="hw-connect__title">{step.title}</h3>
            <p className="hw-connect__msg">{step.message}</p>
          </div>
        ))}
      </div>
    );
  }

  renderFooter() {
    return (
      <div className="hw-connect__footer">
        <h3 className="hw-connect__footer__title">
          {this.context.t('readyToConnect')}
        </h3>
        {this.renderButtons()}
        <p className="hw-connect__footer__msg">
          {this.context.t('havingTroubleConnecting')}
          <a
            className="hw-connect__footer__link"
            href="https://github.com/ETHCF/ethereum-wallet/issues/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {this.context.t('getHelp')}
          </a>
        </p>
      </div>
    );
  }

  renderConnectScreen() {
    return (
      <div className="new-external-account-form">
        {this.renderHeader()}
        {this.renderButtons()}
        {this.renderTrezorAffiliateLink()}
        {this.renderTutorialSteps()}
        {this.renderFooter()}
      </div>
    );
  }

  render() {
    if (this.props.browserSupported) {
      return this.renderConnectScreen();
    }
    return this.renderUnsupportedBrowser();
  }
}
