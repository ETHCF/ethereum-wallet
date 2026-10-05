import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { SEND_ROUTE } from '../../helpers/constants/routes';
import ConfirmTokenTransactionBaseContainer from '../confirm-token-transaction-base';

export default class ConfirmSendToken extends Component {
  static propTypes = {
    navigate: PropTypes.func,
    editTransaction: PropTypes.func,
    tokenAmount: PropTypes.number,
  };

  handleEdit(confirmTransactionData) {
    const { editTransaction, navigate } = this.props;
    editTransaction(confirmTransactionData);
    navigate(SEND_ROUTE);
  }

  render() {
    const { tokenAmount } = this.props;

    return (
      <ConfirmTokenTransactionBaseContainer
        onEdit={(confirmTransactionData) =>
          this.handleEdit(confirmTransactionData)
        }
        tokenAmount={tokenAmount}
      />
    );
  }
}
