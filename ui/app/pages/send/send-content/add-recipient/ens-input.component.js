import classnames from 'classnames';
import copyToClipboard from 'copy-to-clipboard';
import { debounce } from 'lodash';
import log from 'loglevel';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { getNetworkEnsSupport } from '../../../../../../app/scripts/controllers/ens/networks';
import {
  isValidDomainName,
  isValidAddress,
  isValidAddressHead,
} from '../../../../helpers/utils/util';

// Local Constants
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export default class EnsInput extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    className: PropTypes.string,
    network: PropTypes.string,
    selectedAddress: PropTypes.string,
    selectedName: PropTypes.string,
    onChange: PropTypes.func,
    updateEnsResolution: PropTypes.func,
    updateEnsResolutionError: PropTypes.func,
    resolveEnsName: PropTypes.func,
    onPaste: PropTypes.func,
    onReset: PropTypes.func,
    onValidAddressTyped: PropTypes.func,
    contact: PropTypes.object,
  };

  state = {
    input: '',
    toError: null,
    ensResolution: undefined,
  };

  // Counts the field's changes, so a lookup can tell it is out of date.
  lookupSeq = 0;

  componentDidMount() {
    this.setState({ ensResolution: ZERO_ADDRESS });
    this.checkName = debounce(this.lookupEnsName, 200);
  }

  componentWillUnmount() {
    this.checkName.cancel();
    this.unmounted = true;
  }

  // If an address is sent without a nickname, meaning not from ENS or from
  // the user's own accounts, a default of a one-space string is used.
  componentDidUpdate(prevProps) {
    const { input } = this.state;
    const { network } = this.props;

    if (prevProps.network !== network) {
      this.onChange({ target: { value: input } });
    }
  }

  resetInput = () => {
    const { updateEnsResolution, updateEnsResolutionError, onReset } =
      this.props;
    this.onChange({ target: { value: '' } });
    onReset();
    updateEnsResolution('');
    updateEnsResolutionError('');
  };

  lookupEnsName = (ensName) => {
    const recipient = ensName.trim();
    const seq = this.lookupSeq;

    // A lookup for an earlier entry, or one that finishes after a later
    // lookup or a network switch, must not attach its address to the name
    // now in the field.
    const isCurrent = () =>
      !this.unmounted &&
      seq === this.lookupSeq &&
      this.state.input.trim() === recipient;

    log.info(`ENS attempting to resolve name: ${recipient}`);
    this.props
      .resolveEnsName(recipient)
      .then(({ address, name, error } = {}) => {
        if (!isCurrent()) {
          return undefined;
        }
        if (address && !error) {
          // The name that was resolved is the normalized one, which can
          // differ from what was typed (paypaI.eth resolves paypai.eth).
          this.props.updateEnsResolution(address, name);
          return undefined;
        }
        const message = this.ensErrorMessage(error, recipient);
        if (message) {
          this.props.updateEnsResolutionError(message);
        }
        return undefined;
      })
      .catch((reason) => {
        log.error(reason);
        if (isCurrent()) {
          this.props.updateEnsResolutionError(
            this.context.t('ensLookupFailed'),
          );
        }
      });
  };

  ensErrorMessage(error, recipient) {
    const { t } = this.context;
    switch (error) {
      case 'networkChanged':
        // A lookup on the new network follows.
        return undefined;
      case 'notFound':
        return isValidDomainName(recipient)
          ? t('ensNotFoundOnCurrentNetwork')
          : t('ensLookupFailed');
      case 'noAddress':
        return t('noAddressForName');
      case 'badRecord':
        return t('ensRegistrationError');
      case 'invalidName':
        return t('ensIllegalName');
      case 'offchainLookupFailed':
        return t('ensOffchainLookupFailed');
      case 'unsupported':
        return 'Network does not support ENS';
      default:
        return t('ensLookupFailed');
    }
  }

  onPaste = (event) => {
    event.clipboardData.items[0].getAsString((text) => {
      if (isValidAddress(text)) {
        this.props.onPaste(text);
      }
    });
  };

  onChange = (e) => {
    const {
      network,
      onChange,
      updateEnsResolution,
      updateEnsResolutionError,
      onValidAddressTyped,
    } = this.props;
    const input = e.target.value;
    const networkHasEnsSupport = getNetworkEnsSupport(network);

    this.setState({ input }, () => onChange(input));

    // Whatever the field held before no longer applies.
    this.lookupSeq += 1;
    this.checkName.cancel();
    updateEnsResolution('');
    updateEnsResolutionError('');

    if (
      !networkHasEnsSupport &&
      !isValidAddress(input) &&
      !isValidAddressHead(input)
    ) {
      updateEnsResolutionError('Network does not support ENS');
      return;
    }

    if (isValidDomainName(input)) {
      this.checkName(input);
    } else if (onValidAddressTyped && isValidAddress(input)) {
      onValidAddressTyped(input);
    }
  };

  render() {
    const { t } = this.context;
    const { className, selectedAddress } = this.props;
    const { input } = this.state;

    if (selectedAddress) {
      return this.renderSelected();
    }

    return (
      <div className={classnames('ens-input', className)}>
        <div
          className={classnames('ens-input__wrapper', {
            'ens-input__wrapper__status-icon--error': false,
            'ens-input__wrapper__status-icon--valid': false,
          })}
        >
          <div className="ens-input__wrapper__status-icon" />
          <input
            className="ens-input__wrapper__input"
            type="text"
            dir="auto"
            placeholder={t('recipientAddressPlaceholder')}
            onChange={this.onChange}
            onPaste={this.onPaste}
            value={selectedAddress || input}
            autoFocus
            data-testid="ens-input"
          />
          {input && (
            <div
              className="ens-input__wrapper__action-icon ens-input__wrapper__action-icon--erase"
              onClick={this.resetInput}
            />
          )}
        </div>
      </div>
    );
  }

  renderSelected() {
    const { t } = this.context;
    const {
      className,
      selectedAddress,
      selectedName,
      contact = {},
    } = this.props;
    const name = contact.name || selectedName;

    return (
      <div className={classnames('ens-input', className)}>
        <div className="ens-input__wrapper ens-input__wrapper--valid">
          <div className="ens-input__wrapper__status-icon ens-input__wrapper__status-icon--valid" />
          <div
            className="ens-input__wrapper__input ens-input__wrapper__input--selected"
            placeholder={t('recipientAddress')}
            onChange={this.onChange}
          >
            <div className="ens-input__selected-input__title">
              {name || selectedAddress}
            </div>
            {name && (
              <div className="ens-input__selected-input__subtitle">
                {selectedAddress}
              </div>
            )}
          </div>
          <div
            className="ens-input__wrapper__action-icon ens-input__wrapper__action-icon--erase"
            onClick={this.resetInput}
          />
        </div>
      </div>
    );
  }

  ensIcon(recipient) {
    const { hoverText } = this.state;

    return (
      <span
        className="#ensIcon"
        title={hoverText}
        style={{
          position: 'absolute',
          top: '16px',
          left: '-25px',
        }}
      >
        {this.ensIconContents(recipient)}
      </span>
    );
  }

  ensIconContents() {
    const { loadingEns, ensFailure, ensResolution, toError } = this.state;

    if (toError) {
      return null;
    }

    if (loadingEns) {
      return (
        <img
          src="images/loading.svg"
          style={{
            width: '30px',
            height: '30px',
            transform: 'translateY(-6px)',
          }}
        />
      );
    }

    if (ensFailure) {
      return <i className="fa fa-warning fa-lg warning'" />;
    }

    if (ensResolution && ensResolution !== ZERO_ADDRESS) {
      return (
        <i
          className="fa fa-check-circle fa-lg cursor-pointer"
          style={{ color: 'green' }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            copyToClipboard(ensResolution);
          }}
        />
      );
    }

    return null;
  }
}
