import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { compose } from 'redux';

import Button from '../../../components/ui/button';
import { getMostRecentOverviewPage } from '../../../ducks/history/history';
import { getHelpUrl } from '../../../helpers/constants/help';
import { SECRET_INPUT_PROPS } from '../../../helpers/constants/secret-input';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { getEcfWalletAccounts } from '../../../selectors';
import * as actions from '../../../store/actions';

const HELP_LINK = getHelpUrl('import-json');

class JsonImportSubview extends Component {
  state = {
    fileContents: '',
    isEmpty: true,
  };

  inputRef = React.createRef();

  render() {
    const { error, navigate, mostRecentOverviewPage } = this.props;
    const enabled = !this.state.isEmpty && this.state.fileContents !== '';

    return (
      <div className="new-account-import-form__json">
        <p>{this.context.t('usedByClients')}</p>
        <a
          className="warning"
          href={HELP_LINK}
          target="_blank"
          rel="noopener noreferrer"
        >
          {this.context.t('fileImportFail')}
        </a>
        <input
          type="file"
          onChange={this.onFileChange}
          style={{
            padding: '20px 0px 12px 15%',
            fontSize: '15px',
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
          }}
        />
        <input
          className="new-account-import-form__input-password"
          type="password"
          placeholder={this.context.t('enterPassword')}
          id="json-password-box"
          {...SECRET_INPUT_PROPS}
          onKeyPress={this.createKeyringOnEnter.bind(this)}
          onChange={() => this.checkInputEmpty()}
          ref={this.inputRef}
        />
        <div className="new-account-create-form__buttons">
          <Button
            type="default"
            large
            className="new-account-create-form__button"
            onClick={() => navigate(mostRecentOverviewPage)}
          >
            {this.context.t('cancel')}
          </Button>
          <Button
            type="secondary"
            large
            className="new-account-create-form__button"
            onClick={() => this.createNewKeychain()}
            disabled={!enabled}
          >
            {this.context.t('import')}
          </Button>
        </div>
        {error ? <span className="error">{error}</span> : null}
      </div>
    );
  }

  onFileChange = async ({ target }) => {
    const [file] = target.files;
    this.setState({ fileContents: file ? await file.text() : '' });
  };

  createKeyringOnEnter(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.createNewKeychain();
    }
  }

  createNewKeychain() {
    const {
      firstAddress,
      displayWarning,
      navigate,
      importNewJsonAccount,
      mostRecentOverviewPage,
      setSelectedAddress,
    } = this.props;
    const { fileContents } = this.state;

    if (!fileContents) {
      const message = this.context.t('needImportFile');
      displayWarning(message);
      return;
    }

    const password = this.inputRef.current.value;

    importNewJsonAccount([fileContents, password])
      .then(({ selectedAddress }) => {
        if (selectedAddress) {
          navigate(mostRecentOverviewPage);
          displayWarning(null);
        } else {
          displayWarning('Error importing account.');
          setSelectedAddress(firstAddress);
        }
        return undefined;
      })
      .catch((err) => err && displayWarning(err.message || err));
  }

  checkInputEmpty() {
    const password = this.inputRef.current.value;
    let isEmpty = true;
    if (password !== '') {
      isEmpty = false;
    }
    this.setState({ isEmpty });
  }
}

JsonImportSubview.propTypes = {
  error: PropTypes.string,
  displayWarning: PropTypes.func,
  firstAddress: PropTypes.string,
  importNewJsonAccount: PropTypes.func,
  navigate: PropTypes.func,
  setSelectedAddress: PropTypes.func,
  mostRecentOverviewPage: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => {
  return {
    error: state.appState.warning,
    firstAddress: Object.keys(getEcfWalletAccounts(state))[0],
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    displayWarning: (warning) => dispatch(actions.displayWarning(warning)),
    importNewJsonAccount: (options) =>
      dispatch(actions.importNewAccount('JSON File', options)),
    setSelectedAddress: (address) =>
      dispatch(actions.setSelectedAddress(address)),
  };
};

JsonImportSubview.contextTypes = {
  t: PropTypes.func,
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(JsonImportSubview);
