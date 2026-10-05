import { connect } from 'react-redux';

import SendAmountRow from './send-amount-row.component';
import { updateSendErrors } from '../../../../ducks/send/send.duck';
import {
  getGasTotal,
  getPrimaryCurrency,
  getSendToken,
  getSendAmount,
  getSendFromBalance,
  getTokenBalance,
  getSendMaxModeState,
  sendAmountIsInError,
} from '../../../../selectors';
import { setMaxModeTo, updateSendAmount } from '../../../../store/actions';
import { getAmountErrorObject, getGasFeeErrorObject } from '../../send.utils';

export default connect(mapStateToProps, mapDispatchToProps)(SendAmountRow);

function mapStateToProps(state) {
  return {
    amount: getSendAmount(state),
    balance: getSendFromBalance(state),
    gasTotal: getGasTotal(state),
    inError: sendAmountIsInError(state),
    primaryCurrency: getPrimaryCurrency(state),
    sendToken: getSendToken(state),
    tokenBalance: getTokenBalance(state),
    maxModeOn: getSendMaxModeState(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    setMaxModeTo: (bool) => dispatch(setMaxModeTo(bool)),
    updateSendAmount: (newAmount) => dispatch(updateSendAmount(newAmount)),
    updateGasFeeError: (amountDataObject) => {
      dispatch(updateSendErrors(getGasFeeErrorObject(amountDataObject)));
    },
    updateSendAmountError: (amountDataObject) => {
      dispatch(updateSendErrors(getAmountErrorObject(amountDataObject)));
    },
  };
}
