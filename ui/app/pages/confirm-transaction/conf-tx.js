import log from 'loglevel';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { compose } from 'redux';

import { MESSAGE_TYPE } from '../../../../app/scripts/lib/enums';
import SignatureRequest from '../../components/app/signature-request';
import SignatureRequestOriginal from '../../components/app/signature-request-original';
import Loading from '../../components/ui/loading-screen';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import { unconfirmedTransactionsListSelector } from '../../selectors';
import * as actions from '../../store/actions';

function mapStateToProps(state) {
  const { ecfWallet, appState } = state;
  const { unapprovedPersonalMsgCount, unapprovedTypedMessagesCount } =
    ecfWallet;
  const { txId } = appState;

  return {
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    unconfirmedTransactions: unconfirmedTransactionsListSelector(state),
    index: txId,
    unapprovedPersonalMsgCount,
    unapprovedTypedMessagesCount,
    send: state.ecfWallet.send,
    currentNetworkTxList: state.ecfWallet.currentNetworkTxList,
  };
}

// Unapproved transactions (as opposed to signature/decrypt/encryption-key
// messages, which all carry msgParams) for the current network.
function getTransactionsOnly(unconfirmedTransactions = []) {
  return unconfirmedTransactions.filter(({ msgParams }) => !msgParams);
}

class ConfirmTxScreen extends Component {
  static propTypes = {
    mostRecentOverviewPage: PropTypes.string.isRequired,
    unapprovedPersonalMsgCount: PropTypes.number,
    unapprovedTypedMessagesCount: PropTypes.number,
    index: PropTypes.number,
    unconfirmedTransactions: PropTypes.array,
    params: PropTypes.shape({
      id: PropTypes.string,
    }),

    currentNetworkTxList: PropTypes.array,
    navigate: PropTypes.func,
    dispatch: PropTypes.func.isRequired,
    send: PropTypes.shape({
      to: PropTypes.string,
    }).isRequired,
  };

  getUnapprovedMessagesTotal() {
    const { unapprovedPersonalMsgCount = 0, unapprovedTypedMessagesCount = 0 } =
      this.props;

    return unapprovedTypedMessagesCount + unapprovedPersonalMsgCount;
  }

  getTxData() {
    const {
      index,
      unconfirmedTransactions: unconfTxList = [],
      params: { id: transactionId } = {},
    } = this.props;

    log.info(`rendering a combined ${unconfTxList.length} unconf msgs & txs`);

    return transactionId
      ? unconfTxList.find(({ id }) => `${id}` === transactionId)
      : unconfTxList[index];
  }

  signatureSelect(type, version) {
    // Only V3 and V4 typed data use SignatureRequest.
    if (
      type === MESSAGE_TYPE.ETH_SIGN_TYPED_DATA &&
      (version === 'V3' || version === 'V4')
    ) {
      return SignatureRequest;
    }

    return SignatureRequestOriginal;
  }

  stopPropagation(event) {
    if (event.stopPropagation) {
      event.stopPropagation();
    }
  }

  signPersonalMessage(msgData, event) {
    log.info('conf-tx.js: signing personal message');
    const params = msgData.msgParams;
    params.ecfWalletId = msgData.id;
    this.stopPropagation(event);
    return this.props.dispatch(actions.signPersonalMsg(params));
  }

  signTypedMessage(msgData, event) {
    log.info('conf-tx.js: signing typed message');
    const params = msgData.msgParams;
    params.ecfWalletId = msgData.id;
    this.stopPropagation(event);
    return this.props.dispatch(actions.signTypedMsg(params));
  }

  cancelPersonalMessage(msgData, event) {
    log.info('canceling personal message');
    this.stopPropagation(event);
    return this.props.dispatch(actions.cancelPersonalMsg(msgData));
  }

  cancelTypedMessage(msgData, event) {
    log.info('canceling typed message');
    this.stopPropagation(event);
    return this.props.dispatch(actions.cancelTypedMsg(msgData));
  }

  componentDidMount() {
    const { unconfirmedTransactions, navigate, mostRecentOverviewPage, send } =
      this.props;
    const unconfTxList = getTransactionsOnly(unconfirmedTransactions);

    if (
      unconfTxList.length === 0 &&
      !send.to &&
      this.getUnapprovedMessagesTotal() === 0
    ) {
      navigate(mostRecentOverviewPage);
    }
  }

  componentDidUpdate(prevProps) {
    const {
      unconfirmedTransactions,
      currentNetworkTxList,
      send,
      navigate,
      params: { id: transactionId } = {},
      mostRecentOverviewPage,
    } = this.props;

    let prevTx;

    if (transactionId) {
      prevTx = currentNetworkTxList.find(({ id }) => `${id}` === transactionId);
    } else {
      const {
        index: prevIndex,
        unconfirmedTransactions: prevUnconfirmedTransactions,
      } = prevProps;
      const prevUnconfTxList = getTransactionsOnly(prevUnconfirmedTransactions);
      const prevTxData = prevUnconfTxList[prevIndex] || {};
      prevTx =
        currentNetworkTxList.find(({ id }) => id === prevTxData.id) || {};
    }

    const unconfTxList = getTransactionsOnly(unconfirmedTransactions);

    if (prevTx && prevTx.status === 'dropped') {
      this.props.dispatch(
        actions.showModal({
          name: 'TRANSACTION_CONFIRMED',
          onSubmit: () => navigate(mostRecentOverviewPage),
        }),
      );

      return;
    }

    if (
      unconfTxList.length === 0 &&
      !send.to &&
      this.getUnapprovedMessagesTotal() === 0
    ) {
      this.props.navigate(mostRecentOverviewPage);
    }
  }

  render() {
    const txData = this.getTxData() || {};
    const {
      msgParams,
      type,
      msgParams: { version },
    } = txData;
    log.debug('msgParams detected, rendering pending msg');

    if (!msgParams) {
      return <Loading />;
    }

    const SigComponent = this.signatureSelect(type, version);
    return (
      <SigComponent
        txData={txData}
        key={txData.id}
        signPersonalMessage={this.signPersonalMessage.bind(this, txData)}
        signTypedMessage={this.signTypedMessage.bind(this, txData)}
        cancelPersonalMessage={this.cancelPersonalMessage.bind(this, txData)}
        cancelTypedMessage={this.cancelTypedMessage.bind(this, txData)}
      />
    );
  }
}

export default compose(withRouter, connect(mapStateToProps))(ConfirmTxScreen);
