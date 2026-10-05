import PropTypes from 'prop-types';
import React, { Component } from 'react';

import getAccountLink from '../../../../../lib/account-link';
import { getHelpUrl } from '../../../../helpers/constants/help';
import { checksumAddress } from '../../../../helpers/utils/util';
import Identicon from '../../../ui/identicon';
import Modal from '../../modal';

export default class ConfirmRemoveAccount extends Component {
  static propTypes = {
    hideModal: PropTypes.func.isRequired,
    removeAccount: PropTypes.func.isRequired,
    identity: PropTypes.object.isRequired,
    network: PropTypes.string.isRequired,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  handleRemove = () => {
    return this.props
      .removeAccount(this.props.identity.address)
      .then(() => this.props.hideModal());
  };

  handleCancel = () => {
    this.props.hideModal();
  };

  renderSelectedAccount() {
    const { identity } = this.props;
    return (
      <div className="confirm-remove-account__account">
        <div className="confirm-remove-account__account__identicon">
          <Identicon address={identity.address} diameter={32} />
        </div>
        <div className="confirm-remove-account__account__name">
          <span className="confirm-remove-account__account__label">Name</span>
          <span className="account_value">{identity.name}</span>
        </div>
        <div className="confirm-remove-account__account__address">
          <span className="confirm-remove-account__account__label">
            Public Address
          </span>
          <span className="account_value">
            {checksumAddress(identity.address)}
          </span>
        </div>
        <div className="confirm-remove-account__account__link">
          <a
            className=""
            href={getAccountLink(identity.address, this.props.network)}
            target="_blank"
            rel="noopener noreferrer"
            title={this.context.t('etherscanView')}
          >
            <i className="fa fa-external-link-alt" />
          </a>
        </div>
      </div>
    );
  }

  render() {
    const { t } = this.context;

    return (
      <Modal
        headerText={`${t('removeAccount')}?`}
        onClose={this.handleCancel}
        onSubmit={this.handleRemove}
        onCancel={this.handleCancel}
        submitText={t('remove')}
        cancelText={t('nevermind')}
        submitType="secondary"
      >
        <div>
          {this.renderSelectedAccount()}
          <div className="confirm-remove-account__description">
            {t('removeAccountDescription')}
            <a
              className="confirm-remove-account__link"
              rel="noopener noreferrer"
              target="_blank"
              href={getHelpUrl('imported-accounts')}
            >
              {t('learnMore')}
            </a>
          </div>
        </div>
      </Modal>
    );
  }
}
