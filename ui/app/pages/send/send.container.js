import { connect } from 'react-redux';
import { compose } from 'redux';

import SendEther from './send.component';
import { calcGasTotal } from './send.utils';
import { getTokens } from '../../ducks/ecf-wallet/ecf-wallet';
import { fetchBasicGasEstimates } from '../../ducks/gas/gas.duck';
import { resetSendState, updateSendErrors } from '../../ducks/send/send.duck';
import withRouter from '../../helpers/higher-order-components/with-router';
import { isValidDomainName } from '../../helpers/utils/util';
import {
  getBlockGasLimit,
  getCurrentNetwork,
  getGasLimit,
  getGasPrice,
  getGasTotal,
  getSendToken,
  getSendTokenContract,
  getSendAmount,
  getSendEditingTransactionId,
  getSendHexDataFeatureFlagState,
  getSendFromObject,
  getSendTo,
  getSendToNickname,
  getTokenBalance,
  getSelectedAddress,
  getAddressBook,
} from '../../selectors';
import {
  updateSendTo,
  updateSendTokenBalance,
  updateGasData,
  setGasTotal,
  updateSendEnsResolution,
  updateSendEnsResolutionError,
} from '../../store/actions';

function mapStateToProps(state) {
  const editingTransactionId = getSendEditingTransactionId(state);

  return {
    addressBook: getAddressBook(state),
    amount: getSendAmount(state),
    blockGasLimit: getBlockGasLimit(state),
    editingTransactionId,
    from: getSendFromObject(state),
    gasLimit: getGasLimit(state),
    gasPrice: getGasPrice(state),
    gasTotal: getGasTotal(state),
    network: getCurrentNetwork(state),
    selectedAddress: getSelectedAddress(state),
    sendToken: getSendToken(state),
    showHexData: getSendHexDataFeatureFlagState(state),
    to: getSendTo(state),
    toNickname: getSendToNickname(state),
    tokens: getTokens(state),
    tokenBalance: getTokenBalance(state),
    tokenContract: getSendTokenContract(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    updateAndSetGasLimit: ({
      blockGasLimit,
      editingTransactionId,
      gasLimit,
      gasPrice,
      selectedAddress,
      sendToken,
      to,
      value,
      data,
    }) => {
      editingTransactionId
        ? dispatch(setGasTotal(calcGasTotal(gasLimit, gasPrice)))
        : dispatch(
            updateGasData({
              gasPrice,
              selectedAddress,
              sendToken,
              blockGasLimit,
              to,
              value,
              data,
            }),
          );
    },
    updateSendTokenBalance: ({ sendToken, tokenContract, address }) => {
      dispatch(
        updateSendTokenBalance({
          sendToken,
          tokenContract,
          address,
        }),
      );
    },
    updateSendErrors: (newError) => dispatch(updateSendErrors(newError)),
    resetSendState: () => dispatch(resetSendState()),
    updateSendTo: (to, nickname) => dispatch(updateSendTo(to, nickname)),
    fetchBasicGasEstimates: () => dispatch(fetchBasicGasEstimates()),
    updateSendEnsResolution: (ensResolution) =>
      dispatch(updateSendEnsResolution(ensResolution)),
    updateSendEnsResolutionError: (message) =>
      dispatch(updateSendEnsResolutionError(message)),
    updateToNicknameIfNecessary: (to, toNickname, addressBook) => {
      if (isValidDomainName(toNickname)) {
        const addressBookEntry =
          addressBook.find(({ address }) => to === address) || {};
        if (!addressBookEntry.name !== toNickname) {
          dispatch(updateSendTo(to, addressBookEntry.name || ''));
        }
      }
    },
  };
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(SendEther);
