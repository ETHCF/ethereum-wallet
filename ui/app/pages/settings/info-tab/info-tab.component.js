import copyToClipboard from 'copy-to-clipboard';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import Button from '../../../components/ui/button';
import EcfWalletLogo from '../../../components/ui/logo/ecf-wallet-logo';
import { getPrivacyPolicyUrl } from '../../../helpers/constants/privacy-policy';
import { getTermsOfUseUrl } from '../../../helpers/constants/terms-of-use';

// The Ethereum Community Foundation's donation addresses. They sit in the
// source so the build hash covers them: a tampered build shows a different
// hash on this same screen. The Ethereum one is EIP-55 checksummed, so a
// single altered character fails validation in any wallet that checks.
const DONATION_ADDRESSES = [
  { ticker: 'ETH', address: '0x7f52d23E15434E2026A019d22C713b30a2E47730' },
  {
    ticker: 'XMR',
    address:
      '8A38ji4rLujF1AGAe2hZRuZeBR1zPiCVfCaq5xRt9rjXZ8aH12ozUxbi4ViZRHALUQ2Q8dsdmNuvE72NaMnnT4QQGJD38kB',
  },
];

export default class InfoTab extends PureComponent {
  state = {
    version: global.platform.getVersion(),
    buildHash: null,
    buildCommit: null,
    copiedTicker: null,
  };

  componentDidMount() {
    // Written at build time by development/build/build-info.js. It is packaged
    // with the extension, so this never touches the network.
    global
      .fetch('./build-info.json')
      .then((response) => response.json())
      .then(({ hash, commit }) =>
        this.setState({ buildHash: hash, buildCommit: commit }),
      )
      .catch(() => undefined);
  }

  componentWillUnmount() {
    clearTimeout(this.copiedTimer);
  }

  renderDonation() {
    const { t } = this.context;
    const { copiedTicker } = this.state;

    return (
      <div className="info-tab__item">
        <div className="info-tab__version-header">{t('donate')}</div>
        <div className="info-tab__about">{t('donateDescription')}</div>
        {DONATION_ADDRESSES.map(({ ticker, address }) => (
          <button
            key={ticker}
            className="info-tab__donation"
            title={t('copyToClipboard')}
            onClick={() => {
              copyToClipboard(address);
              this.setState({ copiedTicker: ticker });
              clearTimeout(this.copiedTimer);
              this.copiedTimer = setTimeout(
                () => this.setState({ copiedTicker: null }),
                3000,
              );
            }}
          >
            <span className="info-tab__donation-ticker">{ticker}</span>
            <span className="info-tab__donation-address">
              {copiedTicker === ticker ? t('copiedExclamation') : address}
            </span>
          </button>
        ))}
      </div>
    );
  }

  renderBuild() {
    const { t } = this.context;
    const { buildHash, buildCommit } = this.state;

    if (!buildHash) {
      return null;
    }

    return (
      <div className="info-tab__item">
        <div className="info-tab__version-header">{t('buildHash')}</div>
        <div className="info-tab__build-value">{buildHash}</div>
        <div className="info-tab__version-header">{t('buildCommit')}</div>
        <div className="info-tab__build-value">{buildCommit}</div>
        <div className="info-tab__about">{t('buildVerifyInstructions')}</div>
      </div>
    );
  }

  static contextTypes = {
    t: PropTypes.func,
  };

  renderInfoLinks() {
    const { t } = this.context;

    return (
      <div className="settings-page__content-item settings-page__content-item--without-height">
        <div className="info-tab__link-header">{t('links')}</div>
        <div className="info-tab__link-item">
          <Button
            type="link"
            href={getPrivacyPolicyUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="info-tab__link-text"
          >
            {t('privacyMsg')}
          </Button>
        </div>
        <div className="info-tab__link-item">
          <Button
            type="link"
            href={getTermsOfUseUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="info-tab__link-text"
          >
            {t('terms')}
          </Button>
        </div>
        <div className="info-tab__link-item">
          <Button
            type="link"
            href="https://github.com/ETHCF/ethereum-wallet/blob/HEAD/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="info-tab__link-text"
          >
            {t('attributions')}
          </Button>
        </div>
        <hr className="info-tab__separator" />
        <div className="info-tab__link-item">
          <Button
            type="link"
            href="https://ethcf.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="info-tab__link-text"
          >
            {t('visitWebSite')}
          </Button>
        </div>
        <div className="info-tab__link-item">
          <Button
            type="link"
            href="https://github.com/ETHCF/ethereum-wallet/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="info-tab__link-text"
          >
            {t('contactUs')}
          </Button>
        </div>
      </div>
    );
  }

  render() {
    const { t } = this.context;

    return (
      <div className="settings-page__body">
        <div className="settings-page__content-row">
          <div className="settings-page__content-item settings-page__content-item--without-height">
            <div className="info-tab__logo-wrapper">
              <EcfWalletLogo className="info-tab__logo" />
            </div>
            <div className="info-tab__item">
              <div className="info-tab__version-header">
                {t('ecfWalletVersion')}
              </div>
              <div className="info-tab__version-number">
                {this.state.version}
              </div>
            </div>
            <div className="info-tab__item">
              <div className="info-tab__about">{t('ecfWalletDescription')}</div>
            </div>
            {this.renderBuild()}
            {this.renderDonation()}
          </div>
          {this.renderInfoLinks()}
        </div>
      </div>
    );
  }
}
