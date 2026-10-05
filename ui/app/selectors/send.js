import {
  accountsWithSendEtherInfoSelector,
  getAddressBook,
  getSelectedAccount,
  getTargetAccount,
  getAveragePriceEstimateInHexWEI,
} from '.';
import { getTokenContract } from '../helpers/utils/token-util';
import { calcGasTotal } from '../pages/send/send.utils';

export function getBlockGasLimit(state) {
  return state.ecfWallet.currentBlockGasLimit;
}

export function getNativeCurrency(state) {
  return state.ecfWallet.provider?.ticker || 'ETH';
}

export function getCurrentNetwork(state) {
  return state.ecfWallet.network;
}

export function getGasLimit(state) {
  return state.ecfWallet.send.gasLimit || '0';
}

export function getGasPrice(state) {
  return (
    state.ecfWallet.send.gasPrice || getAveragePriceEstimateInHexWEI(state)
  );
}

export function getGasTotal(state) {
  return calcGasTotal(getGasLimit(state), getGasPrice(state));
}

export function getPrimaryCurrency(state) {
  const sendToken = getSendToken(state);
  return sendToken?.symbol;
}

export function getSendToken(state) {
  return state.ecfWallet.send.token;
}

export function getSendTokenAddress(state) {
  return getSendToken(state)?.address;
}

export function getSendTokenContract(state) {
  const sendTokenAddress = getSendTokenAddress(state);
  return sendTokenAddress ? getTokenContract(sendTokenAddress) : null;
}

export function getSendAmount(state) {
  return state.ecfWallet.send.amount;
}

export function getSendHexData(state) {
  return state.ecfWallet.send.data;
}

export function getSendHexDataFeatureFlagState(state) {
  return state.ecfWallet.featureFlags.sendHexData;
}

export function getSendEditingTransactionId(state) {
  return state.ecfWallet.send.editingTransactionId;
}

export function getSendErrors(state) {
  return state.send.errors;
}

export function sendAmountIsInError(state) {
  return Boolean(state.send.errors.amount);
}

export function getSendFrom(state) {
  return state.ecfWallet.send.from;
}

export function getSendFromBalance(state) {
  const fromAccount = getSendFromObject(state);
  return fromAccount.balance;
}

export function getSendFromObject(state) {
  const fromAddress = getSendFrom(state);
  return fromAddress
    ? getTargetAccount(state, fromAddress)
    : getSelectedAccount(state);
}

export function getSendMaxModeState(state) {
  return state.ecfWallet.send.maxModeOn;
}

export function getSendTo(state) {
  return state.ecfWallet.send.to;
}

export function getSendToNickname(state) {
  return state.ecfWallet.send.toNickname;
}

export function getSendToAccounts(state) {
  const fromAccounts = accountsWithSendEtherInfoSelector(state);
  const addressBookAccounts = getAddressBook(state);
  return [...fromAccounts, ...addressBookAccounts];
}
export function getTokenBalance(state) {
  return state.ecfWallet.send.tokenBalance;
}

export function getSendEnsResolution(state) {
  return state.ecfWallet.send.ensResolution;
}

export function getSendEnsResolutionError(state) {
  return state.ecfWallet.send.ensResolutionError;
}

export function getUnapprovedTxs(state) {
  return state.ecfWallet.unapprovedTxs;
}

export function getGasLoadingError(state) {
  return state.send.errors.gasLoading;
}

export function gasFeeIsInError(state) {
  return Boolean(state.send.errors.gasFee);
}

export function getGasButtonGroupShown(state) {
  return state.send.gasButtonGroupShown;
}

export function getTitleKey(state) {
  const isEditing = Boolean(getSendEditingTransactionId(state));
  const isToken = Boolean(getSendToken(state));

  if (!getSendTo(state)) {
    return 'addRecipient';
  }

  if (isEditing) {
    return 'edit';
  } else if (isToken) {
    return 'sendTokens';
  }
  return 'sendETH';
}

export function isSendFormInError(state) {
  return Object.values(getSendErrors(state)).some((n) => n);
}
