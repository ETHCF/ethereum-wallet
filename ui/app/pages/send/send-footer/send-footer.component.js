import PropTypes from 'prop-types';
import React, { Component } from 'react';

import PageContainerFooter from '../../../components/ui/page-container/page-container-footer';
import { CONFIRM_TRANSACTION_ROUTE } from '../../../helpers/constants/routes';

export default class SendFooter extends Component {
  static propTypes = {
    addToAddressBookIfNew: PropTypes.func,
    amount: PropTypes.string,
    data: PropTypes.string,
    clearSend: PropTypes.func,
    editingTransactionId: PropTypes.string,
    from: PropTypes.object,
    gasLimit: PropTypes.string,
    gasPrice: PropTypes.string,
    gasPriceIsCustom: PropTypes.bool,
    gasTotal: PropTypes.string,
    navigate: PropTypes.func,
    inError: PropTypes.bool,
    sendToken: PropTypes.object,
    sign: PropTypes.func,
    to: PropTypes.string,
    toNickname: PropTypes.string,
    toAccounts: PropTypes.array,
    tokenBalance: PropTypes.string,
    unapprovedTxs: PropTypes.object,
    update: PropTypes.func,
    gasIsLoading: PropTypes.bool,
    mostRecentOverviewPage: PropTypes.string.isRequired,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  onCancel() {
    const { clearSend, navigate, mostRecentOverviewPage } = this.props;
    clearSend();
    navigate(mostRecentOverviewPage);
  }

  async onSubmit(event) {
    event.preventDefault();
    const {
      addToAddressBookIfNew,
      amount,
      data,
      editingTransactionId,
      from: { address: from },
      gasLimit: gas,
      gasPrice,
      gasPriceIsCustom,
      sendToken,
      sign,
      to,
      toNickname,
      unapprovedTxs,
      // updateTx,
      update,
      toAccounts,
      navigate,
    } = this.props;

    // Should not be needed because submit should be disabled if there are errors.
    // const noErrors = !amountError && toError === null

    // if (!noErrors) {
    //   return
    // }

    await addToAddressBookIfNew(to, toAccounts, toNickname);
    const promise = editingTransactionId
      ? update({
          amount,
          data,
          editingTransactionId,
          from,
          gas,
          gasPrice,
          gasPriceIsCustom,
          sendToken,
          to,
          unapprovedTxs,
        })
      : sign({
          data,
          sendToken,
          to,
          amount,
          from,
          gas,
          gasPrice,
          gasPriceIsCustom,
        });

    // eslint-disable-next-line promise/catch-or-return -- deliberately not awaited, so onSubmit resolves before navigation
    Promise.resolve(promise).then(() => {
      navigate(CONFIRM_TRANSACTION_ROUTE);
      return undefined;
    });
  }

  formShouldBeDisabled() {
    const {
      data,
      inError,
      sendToken,
      tokenBalance,
      gasTotal,
      to,
      gasLimit,
      gasIsLoading,
    } = this.props;
    const missingTokenBalance = sendToken && !tokenBalance;
    const gasLimitTooLow = gasLimit < 5208; // 5208 is hex value of 21000, minimum gas limit
    const shouldBeDisabled =
      inError ||
      !gasTotal ||
      missingTokenBalance ||
      !(data || to) ||
      gasLimitTooLow ||
      gasIsLoading;
    return shouldBeDisabled;
  }

  render() {
    return (
      <PageContainerFooter
        onCancel={() => this.onCancel()}
        onSubmit={(e) => this.onSubmit(e)}
        disabled={this.formShouldBeDisabled()}
      />
    );
  }
}
