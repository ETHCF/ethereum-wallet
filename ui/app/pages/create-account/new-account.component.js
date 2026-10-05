import PropTypes from 'prop-types';
import React, { Component } from 'react';

import Button from '../../components/ui/button';

export default class NewAccountCreateForm extends Component {
  static defaultProps = {
    newAccountNumber: 0,
  };

  state = {
    newAccountName: '',
    defaultAccountName: this.context.t('newAccountNumberName', [
      this.props.newAccountNumber,
    ]),
  };

  render() {
    const { newAccountName, defaultAccountName } = this.state;
    const { navigate, createAccount, mostRecentOverviewPage } = this.props;
    const createClick = (_) => {
      createAccount(newAccountName || defaultAccountName)
        .then(() => {
          navigate(mostRecentOverviewPage);
          return undefined;
        })
        .catch(console.error);
    };

    return (
      <div className="new-account-create-form">
        <div className="new-account-create-form__input-label">
          {this.context.t('accountName')}
        </div>
        <div>
          <input
            className="new-account-create-form__input"
            value={newAccountName}
            placeholder={defaultAccountName}
            onChange={(event) =>
              this.setState({ newAccountName: event.target.value })
            }
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
              onClick={createClick}
            >
              {this.context.t('create')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

NewAccountCreateForm.propTypes = {
  createAccount: PropTypes.func,
  newAccountNumber: PropTypes.number,
  navigate: PropTypes.func,
  mostRecentOverviewPage: PropTypes.string.isRequired,
};

NewAccountCreateForm.contextTypes = {
  t: PropTypes.func,
};
