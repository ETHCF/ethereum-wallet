import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import validUrl from 'valid-url';

import {
  isLocalRpcUrl,
  normalizeChainId,
} from '../../../../../../app/scripts/controllers/network/chain-utils';
import Button from '../../../../components/ui/button';
import TextField from '../../../../components/ui/text-field';

// The background's rules, so the form accepts exactly the chain IDs that
// saving a custom network accepts.
const isValidChainId = (chainId) => Boolean(normalizeChainId(chainId));

export default class NetworkForm extends PureComponent {
  static contextTypes = {
    t: PropTypes.func.isRequired,
  };

  static propTypes = {
    editRpc: PropTypes.func.isRequired,
    showConfirmDeleteNetworkModal: PropTypes.func.isRequired,
    rpcUrl: PropTypes.string,
    chainId: PropTypes.string,
    ticker: PropTypes.string,
    viewOnly: PropTypes.bool,
    networkName: PropTypes.string,
    onClear: PropTypes.func.isRequired,
    setRpcTarget: PropTypes.func.isRequired,
    networksTabIsInAddMode: PropTypes.bool,
    isCurrentRpcTarget: PropTypes.bool,
    blockExplorerUrl: PropTypes.string,
    rpcPrefs: PropTypes.object,
    rpcUrls: PropTypes.array,
  };

  state = {
    rpcUrl: this.props.rpcUrl,
    chainId: this.props.chainId,
    ticker: this.props.ticker,
    networkName: this.props.networkName,
    blockExplorerUrl: this.props.blockExplorerUrl,
    errors: {},
    localNetworkConfirmed: false,
  };

  componentDidUpdate(prevProps) {
    const { rpcUrl: prevRpcUrl, networksTabIsInAddMode: prevAddMode } =
      prevProps;
    const {
      rpcUrl,
      chainId,
      ticker,
      networkName,
      networksTabIsInAddMode,
      blockExplorerUrl,
    } = this.props;

    if (!prevAddMode && networksTabIsInAddMode) {
      this.setState({
        rpcUrl: '',
        chainId: '',
        ticker: '',
        networkName: '',
        blockExplorerUrl: '',
        errors: {},
        localNetworkConfirmed: false,
      });
    } else if (prevRpcUrl !== rpcUrl) {
      this.setState({
        rpcUrl,
        chainId,
        ticker,
        networkName,
        blockExplorerUrl,
        errors: {},
        localNetworkConfirmed: false,
      });
    }
  }

  componentWillUnmount() {
    this.props.onClear();
    this.setState({
      rpcUrl: '',
      chainId: '',
      ticker: '',
      networkName: '',
      blockExplorerUrl: '',
      errors: {},
      localNetworkConfirmed: false,
    });
  }

  resetForm() {
    const { rpcUrl, chainId, ticker, networkName, blockExplorerUrl } =
      this.props;

    this.setState({
      rpcUrl,
      chainId,
      ticker,
      networkName,
      blockExplorerUrl,
      errors: {},
      localNetworkConfirmed: false,
    });
  }

  /**
   * Whether saving needs the user to confirm the RPC runs on this computer.
   * A node at http://localhost:8545 is usually a development chain, so it is
   * only added once the user says that is what they want. A network already
   * saved with that URL is not asked about again.
   *
   * @returns {boolean} True if the entered RPC URL is new and local.
   */
  needsLocalNetworkConfirmation() {
    const { rpcUrl } = this.state;
    return (
      !this.props.viewOnly &&
      rpcUrl !== this.props.rpcUrl &&
      isLocalRpcUrl(rpcUrl)
    );
  }

  onRpcUrlChange = (event) => {
    const { value } = event.target;
    this.validateUrlRpcUrl(value, 'rpcUrl');
    this.setState({ rpcUrl: value, localNetworkConfirmed: false });
  };

  onSubmit = () => {
    const {
      setRpcTarget,
      rpcUrl: propsRpcUrl,
      editRpc,
      rpcPrefs = {},
      onClear,
      networksTabIsInAddMode,
    } = this.props;
    const { networkName, rpcUrl, chainId, ticker, blockExplorerUrl } =
      this.state;
    if (
      this.needsLocalNetworkConfirmation() &&
      !this.state.localNetworkConfirmed
    ) {
      return;
    }
    if (propsRpcUrl && rpcUrl !== propsRpcUrl) {
      editRpc(propsRpcUrl, rpcUrl, chainId, ticker, networkName, {
        blockExplorerUrl: blockExplorerUrl || rpcPrefs.blockExplorerUrl,
        ...rpcPrefs,
      });
    } else {
      setRpcTarget(rpcUrl, chainId, ticker, networkName, {
        blockExplorerUrl: blockExplorerUrl || rpcPrefs.blockExplorerUrl,
        ...rpcPrefs,
      });
    }

    if (networksTabIsInAddMode) {
      onClear();
    }
  };

  onCancel = () => {
    const { networksTabIsInAddMode, onClear } = this.props;

    if (networksTabIsInAddMode) {
      onClear();
    } else {
      this.resetForm();
    }
  };

  onDelete = () => {
    const { showConfirmDeleteNetworkModal, rpcUrl, onClear } = this.props;
    showConfirmDeleteNetworkModal({
      target: rpcUrl,
      onConfirm: () => {
        this.resetForm();
        onClear();
      },
    });
  };

  stateIsUnchanged() {
    const { rpcUrl, chainId, ticker, networkName, blockExplorerUrl } =
      this.props;

    const {
      rpcUrl: stateRpcUrl,
      chainId: stateChainId,
      ticker: stateTicker,
      networkName: stateNetworkName,
      blockExplorerUrl: stateBlockExplorerUrl,
    } = this.state;

    return (
      stateRpcUrl === rpcUrl &&
      stateChainId === chainId &&
      stateTicker === ticker &&
      stateNetworkName === networkName &&
      stateBlockExplorerUrl === blockExplorerUrl
    );
  }

  renderFormTextField(
    fieldKey,
    textFieldId,
    onChange,
    value,
    optionalTextFieldKey,
  ) {
    const { errors } = this.state;
    const { viewOnly } = this.props;

    return (
      <div className="networks-tab__network-form-row">
        <div className="networks-tab__network-form-label">
          {this.context.t(optionalTextFieldKey || fieldKey)}
        </div>
        <TextField
          type="text"
          id={textFieldId}
          onChange={onChange}
          fullWidth
          margin="dense"
          value={value}
          disabled={viewOnly}
          error={errors[fieldKey]}
        />
      </div>
    );
  }

  setStateWithValue = (stateKey, validator) => {
    return (e) => {
      validator && validator(e.target.value, stateKey);
      this.setState({ [stateKey]: e.target.value });
    };
  };

  setErrorTo = (errorKey, errorVal) => {
    this.setState({
      errors: {
        ...this.state.errors,
        [errorKey]: errorVal,
      },
    });
  };

  validateChainId = (chainId) => {
    // An empty field is reported by the disabled Save button rather than as
    // an error, so the form does not open with one.
    this.setErrorTo(
      'chainId',
      chainId && !isValidChainId(chainId)
        ? `${this.context.t('invalidInput')} chainId`
        : '',
    );
  };

  isValidWhenAppended = (url) => {
    const appendedRpc = `http://${url}`;
    return validUrl.isWebUri(appendedRpc) && !url.match(/^https?:\/\/$/u);
  };

  validateBlockExplorerURL = (url, stateKey) => {
    if (!validUrl.isWebUri(url) && url !== '') {
      this.setErrorTo(
        stateKey,
        this.context.t(
          this.isValidWhenAppended(url)
            ? 'urlErrorMsg'
            : 'invalidBlockExplorerURL',
        ),
      );
    } else {
      this.setErrorTo(stateKey, '');
    }
  };

  validateUrlRpcUrl = (url, stateKey) => {
    const { rpcUrls } = this.props;

    if (!validUrl.isWebUri(url) && url !== '') {
      this.setErrorTo(
        stateKey,
        this.context.t(
          this.isValidWhenAppended(url) ? 'urlErrorMsg' : 'invalidRPC',
        ),
      );
    } else if (rpcUrls.includes(url)) {
      this.setErrorTo(stateKey, this.context.t('urlExistsErrorMsg'));
    } else {
      this.setErrorTo(stateKey, '');
    }
  };

  renderWarning() {
    const { t } = this.context;
    return (
      <div className="networks-tab__network-form-row--warning">
        {t('onlyAddTrustedNetworks')}
      </div>
    );
  }

  renderLocalNetworkConfirmation() {
    const { t } = this.context;
    return (
      <div className="networks-tab__network-form-row networks-tab__network-form-row--local">
        <div>{t('localNetworkWarning')}</div>
        <label className="networks-tab__network-form-confirm">
          <input
            type="checkbox"
            data-testid="network-form-local-confirm"
            checked={this.state.localNetworkConfirmed}
            onChange={(event) =>
              this.setState({ localNetworkConfirmed: event.target.checked })
            }
          />
          {t('localNetworkConfirm')}
        </label>
      </div>
    );
  }

  render() {
    const { t } = this.context;
    const { viewOnly, isCurrentRpcTarget, networksTabIsInAddMode } = this.props;
    const {
      networkName,
      rpcUrl,
      chainId = '',
      ticker,
      blockExplorerUrl,
      errors,
      localNetworkConfirmed,
    } = this.state;
    const needsLocalNetworkConfirmation = this.needsLocalNetworkConfirmation();

    const isSubmitDisabled =
      viewOnly ||
      this.stateIsUnchanged() ||
      Object.values(errors).some((x) => x) ||
      !rpcUrl ||
      !isValidChainId(chainId) ||
      (needsLocalNetworkConfirmation && !localNetworkConfirmed);
    const deletable =
      !networksTabIsInAddMode && !isCurrentRpcTarget && !viewOnly;

    return (
      <div className="networks-tab__network-form">
        {viewOnly ? null : this.renderWarning()}
        {this.renderFormTextField(
          'networkName',
          'network-name',
          this.setStateWithValue('networkName'),
          networkName,
        )}
        {this.renderFormTextField(
          'rpcUrl',
          'rpc-url',
          this.onRpcUrlChange,
          rpcUrl,
        )}
        {this.renderFormTextField(
          'chainId',
          'chainId',
          this.setStateWithValue('chainId', this.validateChainId),
          chainId,
        )}
        {this.renderFormTextField(
          'symbol',
          'network-ticker',
          this.setStateWithValue('ticker'),
          ticker,
          'optionalSymbol',
        )}
        {this.renderFormTextField(
          'blockExplorerUrl',
          'block-explorer-url',
          this.setStateWithValue(
            'blockExplorerUrl',
            this.validateBlockExplorerURL,
          ),
          blockExplorerUrl,
          'optionalBlockExplorerUrl',
        )}
        {needsLocalNetworkConfirmation && this.renderLocalNetworkConfirmation()}
        <div className="network-form__footer">
          {deletable && (
            <Button type="danger" onClick={this.onDelete}>
              {t('delete')}
            </Button>
          )}
          <Button
            type="default"
            onClick={this.onCancel}
            disabled={viewOnly || this.stateIsUnchanged()}
          >
            {t('cancel')}
          </Button>
          <Button
            type="secondary"
            disabled={isSubmitDisabled}
            onClick={this.onSubmit}
          >
            {t('save')}
          </Button>
        </div>
      </div>
    );
  }
}
