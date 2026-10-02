import { connect } from 'react-redux'
import { compose } from 'redux'
import withRouter from '../../helpers/higher-order-components/with-router'
import {
  getNativeCurrencyImage,
  transactionFeeSelector,
} from '../../selectors'
import { getTokens } from '../../ducks/ecf-wallet/ecf-wallet'
import {
  getTokenData,
} from '../../helpers/utils/transactions.util'
import {
  calcTokenAmount,
  getTokenToAddress,
  getTokenValue,
} from '../../helpers/utils/token-util'
import ConfirmTokenTransactionBase from './confirm-token-transaction-base.component'

const mapStateToProps = (state, ownProps) => {
  const { params = {} } = ownProps
  const { id: paramsTransactionId } = params
  const {
    confirmTransaction,
    ecfWallet: { currentNetworkTxList },
  } = state

  const {
    txData: { id: transactionId, txParams: { to: tokenAddress, data } = {} } = {},
  } = confirmTransaction

  const transaction = (
    currentNetworkTxList.find(({ id }) => id === (Number(paramsTransactionId) ||
    transactionId)) || {}
  )

  const { ethTransactionTotal } = transactionFeeSelector(state, transaction)
  const tokens = getTokens(state)
  const currentToken = tokens && tokens.find(({ address }) => tokenAddress === address)
  const { decimals, symbol: tokenSymbol } = currentToken || {}

  const tokenData = getTokenData(data)
  const tokenValue = tokenData && getTokenValue(tokenData.params)
  const toAddress = tokenData && getTokenToAddress(tokenData.params)
  const tokenAmount = tokenData && calcTokenAmount(tokenValue, decimals).toNumber()

  return {
    toAddress,
    tokenAddress,
    tokenAmount,
    tokenSymbol,
    ethTransactionTotal,
    nativeCurrencyImage: getNativeCurrencyImage(state),
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps),
)(ConfirmTokenTransactionBase)
