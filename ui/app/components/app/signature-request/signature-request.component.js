import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import { getEnvironmentType } from '../../../../../app/scripts/lib/util';
import Identicon from '../../ui/identicon';
import SecurityAlerts, { hasDangerAlerts } from '../security-alerts';
import Footer from './signature-request-footer';
import Header from './signature-request-header';
import Message from './signature-request-message';
import { ENVIRONMENT_TYPE_NOTIFICATION } from './signature-request.constants';

export default class SignatureRequest extends PureComponent {
  static propTypes = {
    txData: PropTypes.object.isRequired,
    fromAccount: PropTypes.shape({
      address: PropTypes.string.isRequired,
      balance: PropTypes.string,
      name: PropTypes.string,
    }).isRequired,

    clearConfirmTransaction: PropTypes.func.isRequired,
    cancel: PropTypes.func.isRequired,
    sign: PropTypes.func.isRequired,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  state = {
    alertsAcknowledged: false,
  };

  needsAlertAcknowledgement() {
    return (
      hasDangerAlerts(this.props.txData.securityAlerts) &&
      !this.state.alertsAcknowledged
    );
  }

  componentDidMount() {
    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  componentWillUnmount() {
    this.removeBeforeUnload();
  }

  removeBeforeUnload = () => {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  };

  handleBeforeUnload = (event) => {
    this.props.clearConfirmTransaction();
    this.handleCancel(event);
  };

  handleCancel = (event) => {
    this.removeBeforeUnload();
    return this.props.cancel(event);
  };

  handleSign = (event) => {
    if (this.needsAlertAcknowledgement()) {
      return undefined;
    }
    // Approval can close this popup before the hardware wallet returns a signature.
    this.removeBeforeUnload();
    return this.props.sign(event);
  };

  render() {
    const {
      fromAccount,
      txData: {
        msgParams: { data, origin },
      },
    } = this.props;
    const { address: fromAddress } = fromAccount;
    const { message, domain = {}, primaryType, types } = JSON.parse(data);

    return (
      <div className="signature-request page-container">
        <Header fromAccount={fromAccount} />
        <SecurityAlerts
          alerts={this.props.txData.securityAlerts}
          acknowledged={this.state.alertsAcknowledged}
          onAcknowledge={(alertsAcknowledged) =>
            this.setState({ alertsAcknowledged })
          }
        />
        <div className="signature-request-content">
          <div className="signature-request-content__title">
            {this.context.t('sigRequest')}
          </div>
          <div className="signature-request-content__identicon-container">
            <div className="signature-request-content__identicon-initial">
              {domain.name && domain.name[0]}
            </div>
            <div className="signature-request-content__identicon-border" />
            <Identicon address={fromAddress} diameter={70} />
          </div>
          <div className="signature-request-content__info--bolded">
            {domain.name}
          </div>
          <div className="signature-request-content__info">{origin}</div>
          <div className="signature-request-content__info">{fromAddress}</div>
        </div>
        <section
          className="signature-request-message"
          aria-label="Signing domain"
        >
          <h2>Signing domain</h2>
          <Message data={domain} />
          <p>Message type: {primaryType}</p>
        </section>
        <Message data={message} />
        <details className="signature-request-message">
          <summary>Type definitions</summary>
          <pre>{JSON.stringify(types, null, 2)}</pre>
        </details>
        <Footer
          cancelAction={this.handleCancel}
          signAction={this.handleSign}
          signDisabled={this.needsAlertAcknowledgement()}
        />
      </div>
    );
  }
}
