import { connect } from 'react-redux'
import { gasPriceForTransaction } from '../../../../../app/scripts/lib/transaction-fees'
import { getIsMainnet, getNativeCurrency, getPreferences } from '../../../selectors'
import { getHexGasTotal } from '../../../helpers/utils/confirm-tx.util'
import { sumHexes } from '../../../helpers/utils/transactions.util'
import TransactionBreakdown from './transaction-breakdown.component'

const mapStateToProps = (state, ownProps) => {
  const { transaction } = ownProps
  const { txParams: { gas, value } = {}, txReceipt: { gasUsed } = {} } = transaction
  const gasPrice = gasPriceForTransaction(transaction.txParams, transaction.txReceipt)
  const { showFiatInTestnets } = getPreferences(state)
  const isMainnet = getIsMainnet(state)

  const gasLimit = typeof gasUsed === 'string' ? gasUsed : gas

  const hexGasTotal = (gasLimit && gasPrice && getHexGasTotal({ gasLimit, gasPrice })) || '0x0'
  const totalInHex = sumHexes(hexGasTotal, value)

  return {
    nativeCurrency: getNativeCurrency(state),
    showFiat: (isMainnet || Boolean(showFiatInTestnets)),
    totalInHex,
    gas,
    gasPrice,
    value,
    gasUsed,
  }
}

export default connect(mapStateToProps)(TransactionBreakdown)
