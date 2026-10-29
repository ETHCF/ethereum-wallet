import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';

import AccountList from './account-list';
import SelectHardware from './select-hardware';
import { getMostRecentOverviewPage } from '../../../ducks/history/history';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { formatBalance } from '../../../helpers/utils/util';
import {
  getEcfWalletAccounts,
  getEcfWalletIdentities,
} from '../../../selectors';
import * as actions from '../../../store/actions';

export class ConnectHardwareForm extends Component {
  state = {
    error: null,
    selectedAccounts: [],
    accounts: [],
    browserSupported: true,
    unlocked: false,
    device: null,
  };

  UNSAFE_componentWillReceiveProps(nextProps) {
    const { accounts } = nextProps;
    // Update from the pending state: a page of accounts set in the same batch
    // is not in this.state yet, and would otherwise be replaced by the old one.
    this.setState((state) => ({
      accounts: state.accounts.map((a) => {
        const normalizedAddress = a.address.toLowerCase();
        const balanceValue =
          (accounts[normalizedAddress] &&
            accounts[normalizedAddress].balance) ||
          null;
        return {
          ...a,
          balance: balanceValue ? formatBalance(balanceValue, 6) : '...',
        };
      }),
    }));
  }

  componentDidMount() {
    this.checkIfUnlocked();
  }

  async checkIfUnlocked() {
    for (const device of ['trezor', 'ledger']) {
      const unlocked = await this.props.checkHardwareStatus(
        device,
        this.props.defaultHdPaths[device],
      );
      if (unlocked) {
        this.setState({ unlocked: true });
        this.getPage(device, 0, this.props.defaultHdPaths[device]);
      }
    }
  }

  connectToHardwareWallet = async (device) => {
    if (this.state.accounts.length) {
      return;
    }

    if (device === 'ledger') {
      if (!window.navigator.hid) {
        this.setState({ browserSupported: false, error: null });
        return;
      }
      try {
        const devices = await window.navigator.hid.requestDevice({
          filters: [{ vendorId: 0x2c97 }],
        });
        if (!devices.length) {
          this.setState({ error: this.context.t('ledgerNotSelected') });
          return;
        }
      } catch (error) {
        this.setState({ error: error.message });
        return;
      }
    }

    // Default values
    this.getPage(device, 0, this.props.defaultHdPaths[device]);
  };

  onPathChange = (path) => {
    this.props.setHardwareWalletDefaultHdPath({
      device: this.state.device,
      path,
    });
    this.setState({ selectedAccounts: [] });
    this.getPage(this.state.device, 0, path);
  };

  onAccountChange = (index) => {
    this.setState(({ selectedAccounts }) => ({
      selectedAccounts: selectedAccounts.includes(index)
        ? selectedAccounts.filter((i) => i !== index)
        : [...selectedAccounts, index],
      error: null,
    }));
  };

  onAccountRestriction = () => {
    this.setState({ error: this.context.t('ledgerAccountRestriction') });
  };

  showTemporaryAlert() {
    this.props.showAlert(this.context.t('hardwareWalletConnected'));
    // Autohide the alert after 5 seconds
    setTimeout((_) => {
      this.props.hideAlert();
    }, 5000);
  }

  getPage = (device, page, hdPath) => {
    this.props
      .connectHardware(device, page, hdPath)
      .then((accounts) => {
        if (accounts.length) {
          // If we just loaded the accounts for the first time
          // (device previously locked) show the global alert
          if (this.state.accounts.length === 0 && !this.state.unlocked) {
            this.showTemporaryAlert();
          }

          // Selections are kept across pages
          const newState = { unlocked: true, device, error: null };

          // Map accounts with balances
          newState.accounts = accounts.map((account) => {
            const normalizedAddress = account.address.toLowerCase();
            const balanceValue =
              (this.props.accounts[normalizedAddress] &&
                this.props.accounts[normalizedAddress].balance) ||
              null;
            account.balance = balanceValue
              ? formatBalance(balanceValue, 6)
              : '...';
            return account;
          });

          this.setState(newState);
        }
        return undefined;
      })
      .catch((e) => {
        const errorMessage = e.message;
        if (errorMessage === 'Window blocked') {
          this.setState({ browserSupported: false, error: null });
        } else if (
          errorMessage !== 'Window closed' &&
          errorMessage !== 'Popup closed'
        ) {
          this.setState({ error: errorMessage });
        }
      });
  };

  onForgetDevice = (device) => {
    this.props
      .forgetDevice(device)
      .then((_) => {
        this.setState({
          error: null,
          selectedAccounts: [],
          accounts: [],
          unlocked: false,
        });
        return undefined;
      })
      .catch((e) => {
        this.setState({ error: e.message });
      });
  };

  onUnlockAccounts = async (device) => {
    const { navigate, mostRecentOverviewPage, unlockHardwareWalletAccount } =
      this.props;

    if (!this.state.selectedAccounts.length) {
      this.setState({ error: this.context.t('accountSelectionRequired') });
      return;
    }

    // One at a time: the device handles a single request at once, and each
    // import compares the account list from before and after it.
    const indexes = [...this.state.selectedAccounts].sort((a, b) => a - b);
    try {
      for (const index of indexes) {
        await unlockHardwareWalletAccount(index, device);
      }
    } catch (e) {
      this.setState({ error: e.message });
      return;
    }
    navigate(mostRecentOverviewPage);
  };

  onCancel = () => {
    const { navigate, mostRecentOverviewPage } = this.props;
    navigate(mostRecentOverviewPage);
  };

  renderError() {
    return this.state.error ? (
      <span
        className="error"
        style={{
          margin: '20px 20px 10px',
          display: 'block',
          textAlign: 'center',
        }}
      >
        {this.state.error}
      </span>
    ) : null;
  }

  renderContent() {
    if (!this.state.accounts.length) {
      return (
        <SelectHardware
          connectToHardwareWallet={this.connectToHardwareWallet}
          browserSupported={this.state.browserSupported}
        />
      );
    }

    return (
      <AccountList
        onPathChange={this.onPathChange}
        selectedPath={this.props.defaultHdPaths[this.state.device]}
        device={this.state.device}
        accounts={this.state.accounts}
        selectedAccounts={this.state.selectedAccounts}
        importedAddresses={Object.keys(this.props.identities).map((a) =>
          a.toLowerCase(),
        )}
        onAccountChange={this.onAccountChange}
        network={this.props.network}
        getPage={this.getPage}
        onUnlockAccounts={this.onUnlockAccounts}
        onForgetDevice={this.onForgetDevice}
        onCancel={this.onCancel}
        onAccountRestriction={this.onAccountRestriction}
      />
    );
  }

  render() {
    return (
      <>
        {this.renderError()}
        {this.renderContent()}
      </>
    );
  }
}

ConnectHardwareForm.propTypes = {
  connectHardware: PropTypes.func,
  checkHardwareStatus: PropTypes.func,
  forgetDevice: PropTypes.func,
  showAlert: PropTypes.func,
  hideAlert: PropTypes.func,
  unlockHardwareWalletAccount: PropTypes.func,
  setHardwareWalletDefaultHdPath: PropTypes.func,
  navigate: PropTypes.func,
  network: PropTypes.string,
  accounts: PropTypes.object,
  identities: PropTypes.object,
  defaultHdPaths: PropTypes.object,
  mostRecentOverviewPage: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => {
  const {
    ecfWallet: { network },
  } = state;
  const accounts = getEcfWalletAccounts(state);
  const {
    appState: { defaultHdPaths },
  } = state;

  return {
    network,
    accounts,
    identities: getEcfWalletIdentities(state),
    defaultHdPaths,
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setHardwareWalletDefaultHdPath: ({ device, path }) => {
      return dispatch(actions.setHardwareWalletDefaultHdPath({ device, path }));
    },
    connectHardware: (deviceName, page, hdPath) => {
      return dispatch(actions.connectHardware(deviceName, page, hdPath));
    },
    checkHardwareStatus: (deviceName, hdPath) => {
      return dispatch(actions.checkHardwareStatus(deviceName, hdPath));
    },
    forgetDevice: (deviceName) => {
      return dispatch(actions.forgetDevice(deviceName));
    },
    unlockHardwareWalletAccount: (index, deviceName, hdPath) => {
      return dispatch(
        actions.unlockHardwareWalletAccount(index, deviceName, hdPath),
      );
    },
    showAlert: (msg) => dispatch(actions.showAlert(msg)),
    hideAlert: () => dispatch(actions.hideAlert()),
  };
};

ConnectHardwareForm.contextTypes = {
  t: PropTypes.func,
};

export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(ConnectHardwareForm),
);
