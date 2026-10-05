import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { SEND_ROUTE } from '../../helpers/constants/routes';
import ConfirmTransactionBase from '../confirm-transaction-base';

export default class ConfirmSendEther extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    editTransaction: PropTypes.func,
    navigate: PropTypes.func,
    txParams: PropTypes.object,
  };

  handleEdit({ txData }) {
    const { editTransaction, navigate } = this.props;
    editTransaction(txData);
    navigate(SEND_ROUTE);
  }

  shouldHideData() {
    const { txParams = {} } = this.props;
    return !txParams.data;
  }

  render() {
    const hideData = this.shouldHideData();

    return (
      <ConfirmTransactionBase
        actionKey="confirm"
        hideData={hideData}
        onEdit={(confirmTransactionData) =>
          this.handleEdit(confirmTransactionData)
        }
      />
    );
  }
}
