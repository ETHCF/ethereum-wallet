import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Route, Routes } from 'react-router-dom'
import Loading from '../../components/ui/loading-screen'
import ConfirmTransactionSwitch from '../confirm-transaction-switch'
import ConfirmTransactionBase from '../confirm-transaction-base'
import ConfirmSendEther from '../confirm-send-ether'
import ConfirmSendToken from '../confirm-send-token'
import ConfirmDeployContract from '../confirm-deploy-contract'
import ConfirmApprove from '../confirm-approve'
import ConfirmTokenTransactionBaseContainer from '../confirm-token-transaction-base'
import ConfirmDecryptMessage from '../confirm-decrypt-message'
import ConfirmEncryptionPublicKey from '../confirm-encryption-public-key'

import {
  CONFIRM_DEPLOY_CONTRACT_PATH,
  CONFIRM_SEND_ETHER_PATH,
  CONFIRM_SEND_TOKEN_PATH,
  CONFIRM_APPROVE_PATH,
  CONFIRM_TRANSFER_FROM_PATH,
  CONFIRM_TOKEN_METHOD_PATH,
  SIGNATURE_REQUEST_PATH,
  DECRYPT_MESSAGE_REQUEST_PATH,
  ENCRYPTION_PUBLIC_KEY_REQUEST_PATH,
} from '../../helpers/constants/routes'
import { toRelativeRoutePath } from '../../helpers/utils/routes.util'
import ConfTx from './conf-tx'

export default class ConfirmTransaction extends Component {
  static propTypes = {
    navigate: PropTypes.func.isRequired,
    totalUnapprovedCount: PropTypes.number.isRequired,
    send: PropTypes.object,
    setTransactionToConfirm: PropTypes.func,
    clearConfirmTransaction: PropTypes.func,
    fetchBasicGasAndTimeEstimates: PropTypes.func,
    mostRecentOverviewPage: PropTypes.string.isRequired,
    transaction: PropTypes.object,
    getContractMethodData: PropTypes.func,
    transactionId: PropTypes.string,
    paramsTransactionId: PropTypes.string,
    getTokenParams: PropTypes.func,
    isTokenMethodAction: PropTypes.bool,
  }

  componentDidMount () {
    const {
      totalUnapprovedCount = 0,
      send = {},
      navigate,
      mostRecentOverviewPage,
      transaction: { txParams } = {},
      fetchBasicGasAndTimeEstimates,
      getContractMethodData,
      transactionId,
      paramsTransactionId,
      getTokenParams,
      isTokenMethodAction,
    } = this.props

    if (!totalUnapprovedCount && !send.to) {
      navigate(mostRecentOverviewPage, { replace: true })
      return
    }

    // Message signatures do not consume gas or call a contract.
    if (txParams) {
      fetchBasicGasAndTimeEstimates()
      getContractMethodData(txParams.data)
      if (isTokenMethodAction) {
        getTokenParams(txParams.to)
      }
    }
    const txId = transactionId || paramsTransactionId
    if (txId) {
      this.props.setTransactionToConfirm(txId)
    }
  }

  componentDidUpdate (prevProps) {
    const {
      setTransactionToConfirm,
      transaction: { txData: { txParams: { data } = {} } = {} },
      clearConfirmTransaction,
      getContractMethodData,
      paramsTransactionId,
      transactionId,
      navigate,
      mostRecentOverviewPage,
      totalUnapprovedCount,
    } = this.props

    if (paramsTransactionId && transactionId && prevProps.paramsTransactionId !== paramsTransactionId) {
      clearConfirmTransaction()
      getContractMethodData(data)
      setTransactionToConfirm(paramsTransactionId)
    } else if (prevProps.transactionId && !transactionId && !totalUnapprovedCount) {
      navigate(mostRecentOverviewPage, { replace: true })
    } else if (prevProps.transactionId && transactionId && prevProps.transactionId !== transactionId) {
      navigate(mostRecentOverviewPage, { replace: true })
    }
  }

  render () {
    const { transactionId, paramsTransactionId } = this.props
    // Show routes when state.confirmTransaction has been set and when either the ID in the params
    // isn't specified or is specified and matches the ID in state.confirmTransaction in order to
    // support URLs of /confirm-transaction or /confirm-transaction/<transactionId>
    return transactionId && (!paramsTransactionId || paramsTransactionId === transactionId)
      ? (
        <Routes>
          <Route path={toRelativeRoutePath(CONFIRM_DEPLOY_CONTRACT_PATH)} element={<ConfirmDeployContract />} />
          <Route path={toRelativeRoutePath(CONFIRM_TOKEN_METHOD_PATH)} element={<ConfirmTransactionBase />} />
          <Route path={toRelativeRoutePath(CONFIRM_SEND_ETHER_PATH)} element={<ConfirmSendEther />} />
          <Route path={toRelativeRoutePath(CONFIRM_SEND_TOKEN_PATH)} element={<ConfirmSendToken />} />
          <Route path={toRelativeRoutePath(CONFIRM_APPROVE_PATH)} element={<ConfirmApprove />} />
          <Route path={toRelativeRoutePath(CONFIRM_TRANSFER_FROM_PATH)} element={<ConfirmTokenTransactionBaseContainer />} />
          <Route path={toRelativeRoutePath(SIGNATURE_REQUEST_PATH)} element={<ConfTx />} />
          <Route path={toRelativeRoutePath(DECRYPT_MESSAGE_REQUEST_PATH)} element={<ConfirmDecryptMessage />} />
          <Route path={toRelativeRoutePath(ENCRYPTION_PUBLIC_KEY_REQUEST_PATH)} element={<ConfirmEncryptionPublicKey />} />
          <Route path="*" element={<ConfirmTransactionSwitch />} />
        </Routes>
      )
      : <Loading />
  }
}
