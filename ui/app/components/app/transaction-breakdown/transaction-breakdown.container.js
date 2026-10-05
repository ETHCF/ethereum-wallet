import { connect } from 'react-redux';

import TransactionBreakdown from './transaction-breakdown.component';
import { gasPriceForTransaction } from '../../../../../app/scripts/lib/transaction-fees';
import { getHexGasTotal } from '../../../helpers/utils/confirm-tx.util';
import { sumHexes } from '../../../helpers/utils/transactions.util';
import { getNativeCurrency } from '../../../selectors';

const mapStateToProps = (state, ownProps) => {
  const { transaction } = ownProps;
  const { txParams: { gas, value } = {}, txReceipt: { gasUsed } = {} } =
    transaction;
  const gasPrice = gasPriceForTransaction(
    transaction.txParams,
    transaction.txReceipt,
  );
  const gasLimit = typeof gasUsed === 'string' ? gasUsed : gas;

  const hexGasTotal =
    (gasLimit && gasPrice && getHexGasTotal({ gasLimit, gasPrice })) || '0x0';
  const totalInHex = sumHexes(hexGasTotal, value);

  return {
    nativeCurrency: getNativeCurrency(state),
    totalInHex,
    gas,
    gasPrice,
    value,
    gasUsed,
  };
};

export default connect(mapStateToProps)(TransactionBreakdown);
