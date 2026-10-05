import log from 'loglevel';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { compose } from 'redux';

import { MESSAGE_TYPE } from '../../../../app/scripts/lib/enums';
import txHelper from '../../../lib/tx-helper';
import SignatureRequest from '../../components/app/signature-request';
import SignatureRequestOriginal from '../../components/app/signature-request-original';
import Loading from '../../components/ui/loading-screen';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import * as actions from '../../store/actions';

function mapStateToProps(state) {
  const { ecfWallet, appState } = state;
  const {
    unapprovedMsgCount,
    unapprovedPersonalMsgCount,
    unapprovedTypedMessagesCount,
  } = ecfWallet;
  const { txId } = appState;

  return {
    identities: state.ecfWallet.identities,
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    unapprovedTxs: state.ecfWallet.unapprovedTxs,
    unapprovedMsgs: state.ecfWallet.unapprovedMsgs,
    unapprovedPersonalMsgs: state.ecfWallet.unapprovedPersonalMsgs,
    unapprovedTypedMessages: state.ecfWallet.unapprovedTypedMessages,
    index: txId,
    warning: state.appState.warning,
    network: state.ecfWallet.network,
    provider: state.ecfWallet.provider,
    blockGasLimit: state.ecfWallet.currentBlockGasLimit,
    unapprovedMsgCount,
    unapprovedPersonalMsgCount,
    unapprovedTypedMessagesCount,
    send: state.ecfWallet.send,
    currentNetworkTxList: state.ecfWallet.currentNetworkTxList,
  };
}

class ConfirmTxScreen extends Component {
  static propTypes = {
    mostRecentOverviewPage: PropTypes.string.isRequired,
    unapprovedMsgCount: PropTypes.number,
    unapprovedPersonalMsgCount: PropTypes.number,
    unapprovedTypedMessagesCount: PropTypes.number,
    network: PropTypes.string,
    index: PropTypes.number,
    unapprovedTxs: PropTypes.object,
    unapprovedMsgs: PropTypes.object,
    unapprovedPersonalMsgs: PropTypes.object,
    unapprovedTypedMessages: PropTypes.object,
    params: PropTypes.shape({
      id: PropTypes.string,
    }),

    currentNetworkTxList: PropTypes.array,
    blockGasLimit: PropTypes.string,
    navigate: PropTypes.func,
    identities: PropTypes.object,
    dispatch: PropTypes.func.isRequired,
    send: PropTypes.shape({
      to: PropTypes.string,
    }).isRequired,
  };

  getUnapprovedMessagesTotal() {
    const {
      unapprovedMsgCount = 0,
      unapprovedPersonalMsgCount = 0,
      unapprovedTypedMessagesCount = 0,
    } = this.props;

    return (
      unapprovedTypedMessagesCount +
      unapprovedMsgCount +
      unapprovedPersonalMsgCount
    );
  }

  getTxData() {
    const {
      network,
      index,
      unapprovedTxs,
      unapprovedMsgs,
      unapprovedPersonalMsgs,
      unapprovedTypedMessages,
      params: { id: transactionId } = {},
    } = this.props;

    const unconfTxList = txHelper(
      unapprovedTxs,
      unapprovedMsgs,
      unapprovedPersonalMsgs,
      unapprovedTypedMessages,
      network,
    );

    log.info(`rendering a combined ${unconfTxList.length} unconf msgs & txs`);

    return transactionId
      ? unconfTxList.find(({ id }) => `${id}` === transactionId)
      : unconfTxList[index];
  }

  signatureSelect(type, version) {
    // Temporarily direct only v3 and v4 requests to new code.
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
    const {
      unapprovedTxs = {},
      navigate,
      mostRecentOverviewPage,
      network,
      send,
    } = this.props;
    const unconfTxList = txHelper(unapprovedTxs, {}, {}, {}, network);

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
      unapprovedTxs = {},
      network,
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
      const { index: prevIndex, unapprovedTxs: prevUnapprovedTxs } = prevProps;
      const prevUnconfTxList = txHelper(prevUnapprovedTxs, {}, {}, {}, network);
      const prevTxData = prevUnconfTxList[prevIndex] || {};
      prevTx =
        currentNetworkTxList.find(({ id }) => id === prevTxData.id) || {};
    }

    const unconfTxList = txHelper(unapprovedTxs, {}, {}, {}, network);

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
    const { blockGasLimit } = this.props;

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
        identities={this.props.identities}
        blockGasLimit={blockGasLimit}
        signPersonalMessage={this.signPersonalMessage.bind(this, txData)}
        signTypedMessage={this.signTypedMessage.bind(this, txData)}
        cancelPersonalMessage={this.cancelPersonalMessage.bind(this, txData)}
        cancelTypedMessage={this.cancelTypedMessage.bind(this, txData)}
      />
    );
  }
}

export default compose(withRouter, connect(mapStateToProps))(ConfirmTxScreen);
