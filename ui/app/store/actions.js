import * as ethUtil from '@ethereumjs/util';
import log from 'loglevel';
import pify from 'pify';

import * as actionConstants from './actionConstants';
import { encodeCall } from '../../../app/scripts/lib/contract-call';
import {
  ENVIRONMENT_TYPE_NOTIFICATION,
  INCORRECT_PASSWORD_MESSAGE,
} from '../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../app/scripts/lib/util';
import { switchedToUnconnectedAccount } from '../ducks/alerts/unconnected-account';
import { getUnconnectedAccountAlertEnabledness } from '../ducks/ecf-wallet/ecf-wallet';
import { setCustomGasLimit } from '../ducks/gas/gas.duck';
import { updateSendErrors } from '../ducks/send/send.duck';
import { hasUnconfirmedTransactions } from '../helpers/utils/confirm-tx.util';
import { fetchLocale } from '../helpers/utils/i18n-helper';
import switchDirection from '../helpers/utils/switch-direction';
import { fetchSymbolAndDecimals } from '../helpers/utils/token-util';
import { getMethodDataAsync } from '../helpers/utils/transactions.util';
import { checksumAddress } from '../helpers/utils/util';
import { calcTokenBalance, estimateGas } from '../pages/send/send.utils';
import {
  getPermittedAccountsForCurrentTab,
  getSelectedAddress,
  unconfirmedTransactionsListSelector,
} from '../selectors';

let background = null;
let promisifiedBackground = null;
export function _setBackgroundConnection(backgroundConnection) {
  background = backgroundConnection;
  promisifiedBackground = pify(background);
}

/**
 * Runs `fn` behind the loading overlay, and hides the overlay once `fn`
 * settles, whether or not it threw. Leaving the overlay up would block every
 * click on the page.
 *
 * @param {Function} dispatch - The redux dispatch function.
 * @param {Function} fn - The work to do; it may return a promise.
 * @returns {Promise<*>} Whatever `fn` returns.
 */
async function withLoading(dispatch, fn) {
  dispatch(showLoadingIndication());
  try {
    return await fn();
  } finally {
    dispatch(hideLoadingIndication());
  }
}

/**
 * Like {@link withLoading}, but also logs and displays the error, then
 * rethrows it.
 *
 * @param {Function} dispatch - The redux dispatch function.
 * @param {Function} fn - The work to do; it may return a promise.
 * @returns {Promise<*>} Whatever `fn` returns.
 */
async function withLoadingAndWarning(dispatch, fn) {
  try {
    return await withLoading(dispatch, fn);
  } catch (error) {
    log.error(error);
    dispatch(displayWarning(error.message));
    throw error;
  }
}

export function goHome() {
  return {
    type: actionConstants.GO_HOME,
  };
}

// async actions

export function tryUnlockEcfWallet(password) {
  return async (dispatch) => {
    dispatch(showLoadingIndication());
    log.debug(`background.submitPassword`);

    try {
      await submitPassword(password);
    } catch (error) {
      log.error('ecf-wallet - submitPassword failed', error);
      dispatch(unlockFailed(error.message));
      dispatch(hideLoadingIndication());
      throw error;
    }

    dispatch(unlockSucceeded());

    // The vault is open from here on. Refreshing state and verifying the seed
    // phrase both reach the network, and failing either does not mean the
    // unlock failed, so they must not reject.
    try {
      await forceUpdateEcfWalletState(dispatch);
      await promisifiedBackground.verifySeedPhrase();
    } catch (error) {
      log.error('ecf-wallet - unlocked, but could not finish loading', error);
    }

    dispatch(hideLoadingIndication());
  };
}

export function createNewVaultAndRestore(password, seed) {
  return async (dispatch) => {
    dispatch(showLoadingIndication());
    log.debug(`background.createNewVaultAndRestore`);

    let vault;
    try {
      vault = await promisifiedBackground.createNewVaultAndRestore(
        password,
        seed,
      );
      dispatch(forgotPassword(false));
      await forceUpdateEcfWalletState(dispatch);
    } catch (err) {
      dispatch(displayWarning(err.message));
      dispatch(hideLoadingIndication());
      throw err;
    }

    dispatch(showAccountsPage());
    dispatch(hideLoadingIndication());
    return vault;
  };
}

/**
 * Runs `fn` behind the loading overlay, displaying any error and rethrowing
 * it as a plain Error.
 *
 * @param {Function} dispatch - The redux dispatch function.
 * @param {Function} fn - Resolves with the seed phrase.
 * @returns {Promise<string>} The seed phrase.
 */
async function withSeedPhraseLoading(dispatch, fn) {
  try {
    return await withLoading(dispatch, fn);
  } catch (error) {
    dispatch(displayWarning(error.message));
    throw new Error(error.message);
  }
}

export function createNewVaultAndGetSeedPhrase(password) {
  return (dispatch) =>
    withSeedPhraseLoading(dispatch, async () => {
      await createNewVault(password);
      return getSeedPhrase(password);
    });
}

export function unlockAndGetSeedPhrase(password) {
  return (dispatch) =>
    withSeedPhraseLoading(dispatch, async () => {
      await submitPassword(password);
      const seedWords = await getSeedPhrase(password);
      await forceUpdateEcfWalletState(dispatch);
      return seedWords;
    });
}

export async function submitPassword(password) {
  await promisifiedBackground.submitPassword(password);
}

export async function createNewVault(password) {
  await promisifiedBackground.createNewVaultAndKeychain(password);
  return true;
}

export function getSeedPhrase(password) {
  return promisifiedBackground.getSeedPhrase(password);
}

export function requestRevealSeedWords(password) {
  return (dispatch) => {
    log.debug(`background.getSeedPhrase`);
    return withSeedPhraseLoading(dispatch, () => getSeedPhrase(password));
  };
}

export function tryReverseResolveAddress(address) {
  return async () => {
    try {
      await promisifiedBackground.tryReverseResolveAddress(address);
    } catch (err) {
      log.error(err);
    }
  };
}

export function approveNetworkRequest(id) {
  return () => promisifiedBackground.approveNetworkRequest(id);
}

export function rejectNetworkRequest(id) {
  return () => promisifiedBackground.rejectNetworkRequest(id);
}

export function checkNetworkRequestRpc(id) {
  return () => promisifiedBackground.checkNetworkRequestRpc(id);
}

export function scheduleClipboardClear() {
  return () => promisifiedBackground.scheduleClipboardClear();
}

export function clearClipboard() {
  return () => promisifiedBackground.clearClipboard();
}

export function removeAccount(address) {
  return async (dispatch) => {
    dispatch(showLoadingIndication());

    try {
      await promisifiedBackground.removeAccount(address);
      await forceUpdateEcfWalletState(dispatch);
    } catch (error) {
      dispatch(displayWarning(error.message));
      throw error;
    } finally {
      dispatch(hideLoadingIndication());
    }

    log.info(`Account removed: ${address}`);
    dispatch(showAccountsPage());
  };
}

export function importNewAccount(strategy, args) {
  return async (dispatch) => {
    let newState;
    dispatch(
      showLoadingIndication('This may take a while, please be patient.'),
    );
    try {
      log.debug(`background.importAccountWithStrategy`);
      await promisifiedBackground.importAccountWithStrategy(strategy, args);
      log.debug(`background.getState`);
      newState = await promisifiedBackground.getState();
    } catch (err) {
      dispatch(hideLoadingIndication());
      dispatch(displayWarning(err.message));
      throw err;
    }
    dispatch(hideLoadingIndication());
    dispatch(updateEcfWalletState(newState));
    if (newState.selectedAddress) {
      dispatch({
        type: actionConstants.SHOW_ACCOUNT_DETAIL,
        value: newState.selectedAddress,
      });
    }
    return newState;
  };
}

export function addNewAccount() {
  log.debug(`background.addNewAccount`);
  return async (dispatch, getState) => {
    const oldIdentities = getState().ecfWallet.identities;

    const { identities: newIdentities } = await withLoadingAndWarning(
      dispatch,
      () => promisifiedBackground.addNewAccount(),
    );
    const newAccountAddress = Object.keys(newIdentities).find(
      (address) => !oldIdentities[address],
    );
    await forceUpdateEcfWalletState(dispatch);
    return newAccountAddress;
  };
}

export function checkHardwareStatus(deviceName, hdPath) {
  log.debug(`background.checkHardwareStatus`, deviceName, hdPath);
  return async (dispatch) => {
    const unlocked = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.checkHardwareStatus(deviceName, hdPath),
    );
    await forceUpdateEcfWalletState(dispatch);
    return unlocked;
  };
}

export function forgetDevice(deviceName) {
  log.debug(`background.forgetDevice`, deviceName);
  return async (dispatch) => {
    await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.forgetDevice(deviceName),
    );
    await forceUpdateEcfWalletState(dispatch);
  };
}

export function connectHardware(deviceName, page, hdPath) {
  log.debug(`background.connectHardware`, deviceName, page, hdPath);
  return async (dispatch) => {
    const accounts = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.connectHardware(deviceName, page, hdPath),
    );
    await forceUpdateEcfWalletState(dispatch);
    return accounts;
  };
}

export function unlockHardwareWalletAccount(index, deviceName, hdPath) {
  log.debug(
    `background.unlockHardwareWalletAccount`,
    index,
    deviceName,
    hdPath,
  );
  return async (dispatch) => {
    await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.unlockHardwareWalletAccount(
        index,
        deviceName,
        hdPath,
      ),
    );
  };
}

/**
 * Builds the action creator that approves a pending message request.
 *
 * @param {string} backgroundMethod - The background method that approves it.
 * @returns {Function} An action creator taking the message data.
 */
function approveMessage(backgroundMethod) {
  return (msgData) => async (dispatch) => {
    log.debug(`actions calling background.${backgroundMethod}`);
    const newState = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground[backgroundMethod](msgData),
    );
    dispatch(updateEcfWalletState(newState));
    dispatch(completedTx(msgData.ecfWalletId));
    dispatch(closeCurrentNotificationWindow());
    return msgData;
  };
}

/**
 * Builds the action creator that rejects a pending message request.
 *
 * @param {string} backgroundMethod - The background method that rejects it.
 * @returns {Function} An action creator taking the message data.
 */
function cancelMessage(backgroundMethod) {
  return (msgData) => async (dispatch) => {
    const newState = await withLoading(dispatch, () =>
      promisifiedBackground[backgroundMethod](msgData.id),
    );
    dispatch(updateEcfWalletState(newState));
    dispatch(completedTx(msgData.id));
    dispatch(closeCurrentNotificationWindow());
    return msgData;
  };
}

export const signPersonalMsg = approveMessage('signPersonalMessage');
export const decryptMsg = approveMessage('decryptMessage');
export const encryptionPublicKeyMsg = approveMessage('encryptionPublicKey');
export const signTypedMsg = approveMessage('signTypedMessage');

export const cancelPersonalMsg = cancelMessage('cancelPersonalMessage');
export const cancelDecryptMsg = cancelMessage('cancelDecryptMessage');
export const cancelEncryptionPublicKeyMsg = cancelMessage(
  'cancelEncryptionPublicKey',
);
export const cancelTypedMsg = cancelMessage('cancelTypedMessage');

export function decryptMsgInline(decryptedMsgData) {
  log.debug('action - decryptMsgInline');
  return async (dispatch) => {
    log.debug(`actions calling background.decryptMessageInline`);

    let newState;
    try {
      newState =
        await promisifiedBackground.decryptMessageInline(decryptedMsgData);
    } catch (error) {
      log.error(error);
      dispatch(displayWarning(error.message));
      throw error;
    }

    dispatch(updateEcfWalletState(newState));
    return newState.unapprovedDecryptMsgs[decryptedMsgData.ecfWalletId];
  };
}

export function signTx(txData) {
  return (dispatch) => {
    global.ethQuery.sendTransaction(txData, (err) => {
      if (err) {
        dispatch(displayWarning(err.message));
      }
    });
    dispatch(showConfTxPage());
  };
}

export function setGasLimit(gasLimit) {
  return {
    type: actionConstants.UPDATE_GAS_LIMIT,
    value: gasLimit,
  };
}

export function setGasPrice(gasPrice) {
  return {
    type: actionConstants.UPDATE_GAS_PRICE,
    value: gasPrice,
  };
}

export function setGasTotal(gasTotal) {
  return {
    type: actionConstants.UPDATE_GAS_TOTAL,
    value: gasTotal,
  };
}

export function updateGasData({
  gasPrice,
  blockGasLimit,
  selectedAddress,
  sendToken,
  to,
  value,
  data,
}) {
  return (dispatch) => {
    dispatch(gasLoadingStarted());
    return estimateGas({
      estimateGasMethod: promisifiedBackground.estimateGas,
      blockGasLimit,
      selectedAddress,
      sendToken,
      to,
      value,
      estimateGasPrice: gasPrice,
      data,
    })
      .then((gas) => {
        dispatch(setGasLimit(gas));
        dispatch(setCustomGasLimit(gas));
        dispatch(updateSendErrors({ gasLoading: null }));
        dispatch(gasLoadingFinished());
        return undefined;
      })
      .catch((err) => {
        log.error(err);
        // The gas limit was not estimated, so sending would use whatever it
        // was before, which may be far too low. Hold the form until a later
        // estimate succeeds or the user sets a limit.
        dispatch(updateSendErrors({ gasLoading: 'gasEstimateFailed' }));
        dispatch(gasLoadingFinished());
      });
  };
}

export function gasLoadingStarted() {
  return {
    type: actionConstants.GAS_LOADING_STARTED,
  };
}

export function gasLoadingFinished() {
  return {
    type: actionConstants.GAS_LOADING_FINISHED,
  };
}

export function updateSendTokenBalance({ sendToken, tokenContract, address }) {
  return (dispatch) => {
    const tokenBalancePromise = tokenContract
      ? tokenContract.balanceOf(address)
      : Promise.resolve();
    return tokenBalancePromise
      .then((usersToken) => {
        if (usersToken) {
          const newTokenBalance = calcTokenBalance({ sendToken, usersToken });
          dispatch(setSendTokenBalance(newTokenBalance));
        }
        return undefined;
      })
      .catch((err) => {
        log.error(err);
      });
  };
}

export function setSendTokenBalance(tokenBalance) {
  return {
    type: actionConstants.UPDATE_SEND_TOKEN_BALANCE,
    value: tokenBalance,
  };
}

export function updateSendHexData(value) {
  return {
    type: actionConstants.UPDATE_SEND_HEX_DATA,
    value,
  };
}

export function updateSendTo(to, nickname = '') {
  return {
    type: actionConstants.UPDATE_SEND_TO,
    value: { to, nickname },
  };
}

export function updateSendAmount(amount) {
  return {
    type: actionConstants.UPDATE_SEND_AMOUNT,
    value: amount,
  };
}

export function setMaxModeTo(bool) {
  return {
    type: actionConstants.UPDATE_MAX_MODE,
    value: bool,
  };
}

export function updateSend(newSend) {
  return {
    type: actionConstants.UPDATE_SEND,
    value: newSend,
  };
}

export function updateSendToken(token) {
  return {
    type: actionConstants.UPDATE_SEND_TOKEN,
    value: token,
  };
}

export function clearSend() {
  return {
    type: actionConstants.CLEAR_SEND,
  };
}

export function updateSendEnsResolution(ensResolution) {
  return {
    type: actionConstants.UPDATE_SEND_ENS_RESOLUTION,
    payload: ensResolution,
  };
}

export function updateSendEnsResolutionError(errorMessage) {
  return {
    type: actionConstants.UPDATE_SEND_ENS_RESOLUTION_ERROR,
    payload: errorMessage,
  };
}

export function signTokenTx(tokenAddress, toAddress, amount, txData) {
  return (dispatch) => {
    dispatch(showLoadingIndication());
    pify(global.ethQuery)
      .sendTransaction({
        ...txData,
        to: tokenAddress,
        data: encodeCall('transfer(address,uint256)', [
          toAddress,
          ethUtil.addHexPrefix(amount),
        ]),
      })
      .catch((err) => {
        dispatch(hideLoadingIndication());
        dispatch(displayWarning(err.message));
      });
    dispatch(showConfTxPage());
  };
}

/**
 * Sends the edited transaction to the background. The UI keeps the edited
 * params whether or not the background accepted them; on failure it goes
 * home and rethrows.
 *
 * @param {Function} dispatch - The redux dispatch function.
 * @param {string} backgroundMethod - The background method to call.
 * @param {object} txData - The edited transaction.
 * @param {object} [options] - Optional settings.
 * @param {boolean} [options.clearSendForm] - Whether to also clear the send
 * form once the background has answered.
 */
async function submitEditedTx(
  dispatch,
  backgroundMethod,
  txData,
  { clearSendForm = false } = {},
) {
  let error;
  try {
    await promisifiedBackground[backgroundMethod](txData);
  } catch (err) {
    error = err;
  }

  dispatch(updateTransactionParams(txData.id, txData.txParams));
  if (clearSendForm) {
    dispatch(clearSend());
  }

  if (error) {
    dispatch(goHome());
    log.error(error.message);
    throw error;
  }
}

export function updateTransaction(txData) {
  return (dispatch) =>
    withLoading(dispatch, async () => {
      await submitEditedTx(dispatch, 'updateTransaction', txData);
      await forceUpdateEcfWalletState(dispatch);
      dispatch(showConfTxPage({ id: txData.id }));
      return txData;
    });
}

export function updateAndApproveTx(txData) {
  return async (dispatch) => {
    await withLoading(dispatch, async () => {
      await submitEditedTx(dispatch, 'updateAndApproveTransaction', txData, {
        clearSendForm: true,
      });
      await forceUpdateEcfWalletState(dispatch);
      dispatch(clearSend());
      dispatch(completedTx(txData.id));
    });
    dispatch(closeCurrentNotificationWindow());
    return txData;
  };
}

export function completedTx(id) {
  return (dispatch, getState) => {
    const otherUnconfirmedActions = unconfirmedTransactionsListSelector(
      getState(),
    ).filter((tx) => tx.id !== id);
    dispatch({
      type: actionConstants.COMPLETED_TX,
      value: {
        id,
        unconfirmedActionsCount: otherUnconfirmedActions.length,
      },
    });
  };
}

export function updateTransactionParams(id, txParams) {
  return {
    type: actionConstants.UPDATE_TRANSACTION_PARAMS,
    id,
    value: txParams,
  };
}

export function cancelTx(txData) {
  return async (dispatch) => {
    await withLoading(dispatch, async () => {
      await promisifiedBackground.cancelTransaction(txData.id);
      await forceUpdateEcfWalletState(dispatch);
      dispatch(clearSend());
      dispatch(completedTx(txData.id));
    });
    dispatch(closeCurrentNotificationWindow());
    return txData;
  };
}

/**
 * Cancels all of the given transactions
 *
 * @param {Array<object>} txDataList - a list of tx data objects
 * @returns {function(*): Promise<void>} A thunk that cancels the transactions
 */
export function cancelTxs(txDataList) {
  return async (dispatch) => {
    const txIds = txDataList.map(({ id }) => id);
    await withLoading(dispatch, async () => {
      await Promise.all(
        txIds.map((id) => promisifiedBackground.cancelTransaction(id)),
      );
      await forceUpdateEcfWalletState(dispatch);
      dispatch(clearSend());
      txIds.forEach((id) => {
        dispatch(completedTx(id));
      });
    });

    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      global.platform.closeCurrentWindow();
    }
  };
}

export function markPasswordForgotten() {
  return forgotPassword(true);
}

export function unMarkPasswordForgotten() {
  return forgotPassword(false);
}

export function forgotPassword(forgotPasswordState = true) {
  return {
    type: actionConstants.FORGOT_PASSWORD,
    value: forgotPasswordState,
  };
}

//
// unlock screen
//

export function unlockFailed(message) {
  return {
    type: actionConstants.UNLOCK_FAILED,
    value: message,
  };
}

export function unlockSucceeded(message) {
  return {
    type: actionConstants.UNLOCK_SUCCEEDED,
    value: message,
  };
}

export function updateEcfWalletState(newState) {
  return (dispatch, getState) => {
    const { ecfWallet: currentState } = getState();

    const { currentLocale, selectedAddress } = currentState;
    const { currentLocale: newLocale, selectedAddress: newSelectedAddress } =
      newState;

    if (currentLocale && newLocale && currentLocale !== newLocale) {
      dispatch(updateCurrentLocale(newLocale));
    }
    if (selectedAddress !== newSelectedAddress) {
      dispatch({ type: actionConstants.SELECTED_ADDRESS_CHANGED });
    }

    dispatch({
      type: actionConstants.UPDATE_ECF_WALLET_STATE,
      value: newState,
    });

    // The background locks by itself on auto-lock. The UI then locks as it
    // does when the user locks it.
    if (currentState.isUnlocked && newState.isUnlocked === false) {
      dispatch({ type: actionConstants.LOCK_ECF_WALLET });
    }
  };
}

export function lockEcfWallet() {
  log.debug(`background.setLocked`);

  return async (dispatch) => {
    dispatch(showLoadingIndication());

    // The UI locks even when the background could not.
    try {
      await promisifiedBackground.setLocked();
      log.debug(`background.getState`);
      const newState = await promisifiedBackground.getState();
      dispatch(updateEcfWalletState(newState));
    } catch (error) {
      dispatch(displayWarning(error.message));
    }

    dispatch(hideLoadingIndication());
    dispatch({ type: actionConstants.LOCK_ECF_WALLET });
  };
}

async function _setSelectedAddress(dispatch, address) {
  log.debug(`background.setSelectedAddress`);
  const tokens = await promisifiedBackground.setSelectedAddress(address);
  dispatch(updateTokens(tokens));
}

export function setSelectedAddress(address) {
  return async (dispatch) => {
    dispatch(showLoadingIndication());
    log.debug(`background.setSelectedAddress`);
    try {
      await _setSelectedAddress(dispatch, address);
    } catch (error) {
      dispatch(hideLoadingIndication());
      dispatch(displayWarning(error.message));
      return;
    }
    dispatch(hideLoadingIndication());
  };
}

export function showAccountDetail(address) {
  return async (dispatch, getState) => {
    dispatch(showLoadingIndication());
    log.debug(`background.setSelectedAddress`);

    const state = getState();
    const unconnectedAccountAccountAlertIsEnabled =
      getUnconnectedAccountAlertEnabledness(state);
    const activeTabOrigin = state.activeTab.origin;
    const selectedAddress = getSelectedAddress(state);
    const permittedAccountsForCurrentTab =
      getPermittedAccountsForCurrentTab(state);
    const currentTabIsConnectedToPreviousAddress =
      Boolean(activeTabOrigin) &&
      permittedAccountsForCurrentTab.includes(selectedAddress);
    const currentTabIsConnectedToNextAddress =
      Boolean(activeTabOrigin) &&
      permittedAccountsForCurrentTab.includes(address);
    const switchingToUnconnectedAddress =
      currentTabIsConnectedToPreviousAddress &&
      !currentTabIsConnectedToNextAddress;

    try {
      await _setSelectedAddress(dispatch, address);
    } catch (error) {
      dispatch(hideLoadingIndication());
      dispatch(displayWarning(error.message));
      return;
    }
    dispatch(hideLoadingIndication());
    dispatch({
      type: actionConstants.SHOW_ACCOUNT_DETAIL,
      value: address,
    });
    if (
      unconnectedAccountAccountAlertIsEnabled &&
      switchingToUnconnectedAddress
    ) {
      dispatch(switchedToUnconnectedAccount());
      await setUnconnectedAccountAlertShown(activeTabOrigin);
    }
  };
}

export function addPermittedAccount(origin, address) {
  return async (dispatch) => {
    await promisifiedBackground.addPermittedAccount(origin, address);
    await forceUpdateEcfWalletState(dispatch);
  };
}

export function removePermittedAccount(origin, address) {
  return async (dispatch) => {
    await promisifiedBackground.removePermittedAccount(origin, address);
    await forceUpdateEcfWalletState(dispatch);
  };
}

export function showAccountsPage() {
  return {
    type: actionConstants.SHOW_ACCOUNTS_PAGE,
  };
}

export function showConfTxPage({ id } = {}) {
  return {
    type: actionConstants.SHOW_CONF_TX_PAGE,
    id,
  };
}

export function addToken(address, symbol, decimals, image) {
  return async (dispatch) => {
    const tokens = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.addToken(address, symbol, decimals, image),
    );
    dispatch(updateTokens(tokens));
    return tokens;
  };
}

export function removeToken(address) {
  return async (dispatch) => {
    const tokens = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.removeToken(address),
    );
    dispatch(updateTokens(tokens));
    return tokens;
  };
}

export function addTokens(tokens) {
  return (dispatch) => {
    if (Array.isArray(tokens)) {
      return Promise.all(
        tokens.map(({ address, symbol, decimals }) =>
          dispatch(addToken(address, symbol, decimals)),
        ),
      );
    }
    return Promise.all(
      Object.entries(tokens).map(([_, { address, symbol, decimals }]) =>
        dispatch(addToken(address, symbol, decimals)),
      ),
    );
  };
}

export function removeSuggestedTokens() {
  return async (dispatch) => {
    try {
      await withLoading(dispatch, () =>
        promisifiedBackground.removeSuggestedTokens(),
      );
    } catch (err) {
      dispatch(displayWarning(err.message));
    }
    dispatch(clearPendingTokens());
    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      global.platform.closeCurrentWindow();
      return;
    }
    await forceUpdateEcfWalletState(dispatch);
  };
}

export function updateTokens(newTokens) {
  return {
    type: actionConstants.UPDATE_TOKENS,
    newTokens,
  };
}

export function clearPendingTokens() {
  return {
    type: actionConstants.CLEAR_PENDING_TOKENS,
  };
}

/**
 * Calls a background method that adds a replacement transaction, and
 * dispatches the resulting state.
 *
 * @param {Function} dispatch - The redux dispatch function.
 * @param {string} backgroundMethod - The background method to call.
 * @param {...*} args - The arguments for the background method.
 * @returns {Promise<object>} The replacement transaction.
 */
async function createReplacementTx(dispatch, backgroundMethod, ...args) {
  let newState;
  try {
    newState = await promisifiedBackground[backgroundMethod](...args);
  } catch (err) {
    dispatch(displayWarning(err.message));
    throw err;
  }

  const { currentNetworkTxList } = newState;
  const newTx = currentNetworkTxList[currentNetworkTxList.length - 1];
  dispatch(updateEcfWalletState(newState));
  return newTx;
}

export function createCancelTransaction(txId, customGasPrice) {
  log.debug('background.cancelTransaction');

  return async (dispatch) => {
    const { id } = await createReplacementTx(
      dispatch,
      'createCancelTransaction',
      txId,
      customGasPrice,
    );
    return id;
  };
}

export function createSpeedUpTransaction(txId, customGasPrice, customGasLimit) {
  log.debug('background.createSpeedUpTransaction');

  return (dispatch) =>
    createReplacementTx(
      dispatch,
      'createSpeedUpTransaction',
      txId,
      customGasPrice,
      customGasLimit,
    );
}

//
// config
//

export function setProviderType(type) {
  return async (dispatch, getState) => {
    const { type: currentProviderType } = getState().ecfWallet.provider;
    log.debug(`background.setProviderType`, type);

    try {
      await promisifiedBackground.setProviderType(type);
    } catch (error) {
      log.error(error);
      dispatch(displayWarning('Had a problem changing networks!'));
      return;
    }
    dispatch(setPreviousProvider(currentProviderType));
    dispatch(updateProviderType(type));
  };
}

export function updateProviderType(type) {
  return {
    type: actionConstants.SET_PROVIDER_TYPE,
    value: type,
  };
}

export function setPreviousProvider(type) {
  return {
    type: actionConstants.SET_PREVIOUS_PROVIDER,
    value: type,
  };
}

export function updateAndSetCustomRpc(
  newRpc,
  chainId,
  ticker = 'ETH',
  nickname,
  rpcPrefs,
) {
  return async (dispatch) => {
    log.debug(
      `background.updateAndSetCustomRpc: ${newRpc} ${chainId} ${ticker} ${nickname}`,
    );

    try {
      await promisifiedBackground.updateAndSetCustomRpc(
        newRpc,
        chainId,
        ticker,
        nickname || newRpc,
        rpcPrefs,
      );
    } catch (error) {
      log.error(error);
      dispatch(displayWarning('Had a problem changing networks!'));
      return;
    }

    dispatch({
      type: actionConstants.SET_RPC_TARGET,
      value: newRpc,
    });
  };
}

export function editRpc(
  oldRpc,
  newRpc,
  chainId,
  ticker = 'ETH',
  nickname,
  rpcPrefs,
) {
  return async (dispatch) => {
    log.debug(`background.delRpcTarget: ${oldRpc}`);
    try {
      await promisifiedBackground.delCustomRpc(oldRpc);
    } catch (error) {
      log.error(error);
      dispatch(displayWarning('Had a problem removing network!'));
      return;
    }

    try {
      await promisifiedBackground.updateAndSetCustomRpc(
        newRpc,
        chainId,
        ticker,
        nickname || newRpc,
        rpcPrefs,
      );
    } catch (error) {
      log.error(error);
      dispatch(displayWarning('Had a problem changing networks!'));
      return;
    }

    dispatch({
      type: actionConstants.SET_RPC_TARGET,
      value: newRpc,
    });
  };
}

export function setRpcTarget(newRpc, chainId, ticker = 'ETH', nickname) {
  return async (dispatch) => {
    log.debug(
      `background.setRpcTarget: ${newRpc} ${chainId} ${ticker} ${nickname}`,
    );

    try {
      await promisifiedBackground.setCustomRpc(
        newRpc,
        chainId,
        ticker,
        nickname || newRpc,
      );
    } catch (error) {
      log.error(error);
      dispatch(displayWarning('Had a problem changing networks!'));
    }
  };
}

export function delRpcTarget(oldRpc) {
  return async (dispatch) => {
    log.debug(`background.delRpcTarget: ${oldRpc}`);
    try {
      await promisifiedBackground.delCustomRpc(oldRpc);
    } catch (err) {
      log.error(err);
      dispatch(displayWarning('Had a problem removing network!'));
      throw err;
    }
  };
}

// Calls the addressBookController to add a new address.
export function addToAddressBook(recipient, nickname = '', memo = '') {
  log.debug(`background.addToAddressBook`);

  return async (dispatch, getState) => {
    const chainId = getState().ecfWallet.network;

    let set;
    try {
      set = await promisifiedBackground.setAddressBook(
        checksumAddress(recipient),
        nickname,
        chainId,
        memo,
      );
    } catch (error) {
      log.error(error);
      dispatch(displayWarning('Address book failed to update'));
      throw error;
    }
    if (!set) {
      dispatch(displayWarning('Address book failed to update'));
    }
  };
}

export function showNetworkDropdown() {
  return {
    type: actionConstants.NETWORK_DROPDOWN_OPEN,
  };
}

export function hideNetworkDropdown() {
  return {
    type: actionConstants.NETWORK_DROPDOWN_CLOSE,
  };
}

export function showModal(payload) {
  return {
    type: actionConstants.MODAL_OPEN,
    payload,
  };
}

export function hideModal(payload) {
  return {
    type: actionConstants.MODAL_CLOSE,
    payload,
  };
}

export function closeCurrentNotificationWindow() {
  return (_dispatch, getState) => {
    if (
      getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION &&
      !hasUnconfirmedTransactions(getState())
    ) {
      global.platform.closeCurrentWindow();
    }
  };
}

export function showSidebar({ transitionName, type, props }) {
  return {
    type: actionConstants.SIDEBAR_OPEN,
    value: {
      transitionName,
      type,
      props,
    },
  };
}

export function hideSidebar() {
  return {
    type: actionConstants.SIDEBAR_CLOSE,
  };
}

export function showAlert(msg) {
  return {
    type: actionConstants.ALERT_OPEN,
    value: msg,
  };
}

export function hideAlert() {
  return {
    type: actionConstants.ALERT_CLOSE,
  };
}

export function showLoadingIndication(message) {
  return {
    type: actionConstants.SHOW_LOADING,
    value: message,
  };
}

export function setHardwareWalletDefaultHdPath({ device, path }) {
  return {
    type: actionConstants.SET_HARDWARE_WALLET_DEFAULT_HD_PATH,
    value: { device, path },
  };
}

export function hideLoadingIndication() {
  return {
    type: actionConstants.HIDE_LOADING,
  };
}

export function displayWarning(text) {
  return {
    type: actionConstants.DISPLAY_WARNING,
    value: text,
  };
}

export function hideWarning() {
  return {
    type: actionConstants.HIDE_WARNING,
  };
}

export function exportAccount(password, address) {
  return async (dispatch) => {
    // The background checks the password before exporting.
    log.debug(`background.exportAccount`);
    let result;
    try {
      result = await withLoading(dispatch, () =>
        promisifiedBackground.exportAccount(address, password),
      );
    } catch (err) {
      log.error(err);
      dispatch(
        displayWarning(
          err.message === INCORRECT_PASSWORD_MESSAGE
            ? 'Incorrect Password.'
            : 'Had a problem exporting the account.',
        ),
      );
      throw err;
    }

    dispatch(showPrivateKey(result));
    return result;
  };
}

export function showPrivateKey(key) {
  return {
    type: actionConstants.SHOW_PRIVATE_KEY,
    value: key,
  };
}

export function setAccountLabel(account, label) {
  return async (dispatch) => {
    log.debug(`background.setAccountLabel`);
    await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.setAccountLabel(account, label),
    );
    dispatch({
      type: actionConstants.SET_ACCOUNT_LABEL,
      value: { account, label },
    });
    return account;
  };
}

export function clearAccountDetails() {
  return {
    type: actionConstants.CLEAR_ACCOUNT_DETAILS,
  };
}

export function showSendTokenPage() {
  return {
    type: actionConstants.SHOW_SEND_TOKEN_PAGE,
  };
}

export function setFeatureFlag(feature, activated, notificationType) {
  return async (dispatch) => {
    const updatedFeatureFlags = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.setFeatureFlag(feature, activated),
    );
    dispatch(updateFeatureFlags(updatedFeatureFlags));
    if (notificationType) {
      dispatch(showModal({ name: notificationType }));
    }
    return updatedFeatureFlags;
  };
}

export function updateFeatureFlags(updatedFeatureFlags) {
  return {
    type: actionConstants.UPDATE_FEATURE_FLAGS,
    value: updatedFeatureFlags,
  };
}

export function setPreference(preference, value) {
  return async (dispatch) => {
    const updatedPreferences = await withLoadingAndWarning(dispatch, () =>
      promisifiedBackground.setPreference(preference, value),
    );
    dispatch(updatePreferences(updatedPreferences));
    return updatedPreferences;
  };
}

export function updatePreferences(value) {
  return {
    type: actionConstants.UPDATE_PREFERENCES,
    value,
  };
}

export function setDefaultHomeActiveTabName(value) {
  return async () => {
    await promisifiedBackground.setDefaultHomeActiveTabName(value);
  };
}

export function setThemePreference(value) {
  return setPreference('theme', value);
}

export function setAutoLockTimeLimit(value) {
  return setPreference('autoLockTimeLimit', value);
}

export function setCompletedOnboarding() {
  return async (dispatch) => {
    dispatch(showLoadingIndication());

    try {
      await promisifiedBackground.completeOnboarding();
    } catch (err) {
      dispatch(displayWarning(err.message));
      throw err;
    }

    dispatch(completeOnboarding());
    dispatch(hideLoadingIndication());
  };
}

export function completeOnboarding() {
  return {
    type: actionConstants.COMPLETE_ONBOARDING,
  };
}

export function setMouseUserState(isMouseUser) {
  return {
    type: actionConstants.SET_MOUSE_USER_STATE,
    value: isMouseUser,
  };
}

export async function forceUpdateEcfWalletState(dispatch) {
  log.debug(`background.getState`);

  let newState;
  try {
    newState = await promisifiedBackground.getState();
  } catch (error) {
    dispatch(displayWarning(error.message));
    throw error;
  }

  dispatch(updateEcfWalletState(newState));
  return newState;
}

export function toggleAccountMenu() {
  return {
    type: actionConstants.TOGGLE_ACCOUNT_MENU,
  };
}

export function setUsePhishDetect(val) {
  return (dispatch) => {
    dispatch(showLoadingIndication());
    log.debug(`background.setUsePhishDetect`);
    background.setUsePhishDetect(val, (err) => {
      dispatch(hideLoadingIndication());
      if (err) {
        dispatch(displayWarning(err.message));
      }
    });
  };
}

export function setUse4ByteResolution(val) {
  return (dispatch) => {
    dispatch(showLoadingIndication());
    log.debug(`background.setUse4ByteResolution`);
    background.setUse4ByteResolution(val, (err) => {
      dispatch(hideLoadingIndication());
      if (err) {
        dispatch(displayWarning(err.message));
      }
    });
  };
}

export function updateCurrentLocale(key) {
  return async (dispatch) => {
    dispatch(showLoadingIndication());
    const localeMessages = await fetchLocale(key);

    log.debug(`background.setCurrentLocale`);
    let textDirection;
    try {
      textDirection = await promisifiedBackground.setCurrentLocale(key);
    } catch (err) {
      dispatch(hideLoadingIndication());
      dispatch(displayWarning(err.message));
      return;
    }
    switchDirection(textDirection);
    dispatch(setCurrentLocale(key, localeMessages));
    dispatch(hideLoadingIndication());
  };
}

export function setCurrentLocale(locale, messages) {
  return {
    type: actionConstants.SET_CURRENT_LOCALE,
    value: {
      locale,
      messages,
    },
  };
}

export function setPendingTokens(pendingTokens) {
  const { customToken = {}, selectedTokens = {} } = pendingTokens;
  const { address, symbol, decimals } = customToken;
  const tokens =
    address && symbol && decimals
      ? { ...selectedTokens, [address]: { ...customToken, isCustom: true } }
      : selectedTokens;

  return {
    type: actionConstants.SET_PENDING_TOKENS,
    payload: tokens,
  };
}

// Permissions

export function requestAccountsPermissionWithId(origin) {
  return async (dispatch) => {
    const id =
      await promisifiedBackground.requestAccountsPermissionWithId(origin);
    await forceUpdateEcfWalletState(dispatch);
    return id;
  };
}

/**
 * Approves the permissions request.
 *
 * @param {object} request - The permissions request to approve
 * @param {string[]} accounts - The accounts to expose, if any.
 * @returns {Function} A thunk that approves the request.
 */
export function approvePermissionsRequest(request, accounts) {
  return () => {
    background.approvePermissionsRequest(request, accounts);
  };
}

/**
 * Calls a background method, displaying and rethrowing any error, then
 * refreshes the UI state.
 *
 * @param {Function} dispatch - The redux dispatch function.
 * @param {Function} fn - Calls the background.
 * @returns {Promise<object>} The refreshed background state.
 */
async function callAndRefreshState(dispatch, fn) {
  try {
    await fn();
  } catch (err) {
    dispatch(displayWarning(err.message));
    throw err;
  }
  return await forceUpdateEcfWalletState(dispatch);
}

/**
 * Rejects the permissions request with the given ID.
 *
 * @param {string} requestId - The id of the request to be rejected
 * @returns {Function} A thunk that rejects the request and resolves once the
 * state has been updated.
 */
export function rejectPermissionsRequest(requestId) {
  return (dispatch) =>
    callAndRefreshState(dispatch, () =>
      promisifiedBackground.rejectPermissionsRequest(requestId),
    );
}

/**
 * Clears the given permissions for the given origin.
 *
 * @param {object} domains - A map of origins to the names of the
 * permissions to remove for each.
 * @returns {Function} A thunk that removes the permissions.
 */
export function removePermissionsFor(domains) {
  return () => {
    background.removePermissionsFor(domains);
  };
}

export function setFirstTimeFlowType(type) {
  return (dispatch) => {
    log.debug(`background.setFirstTimeFlowType`);
    background.setFirstTimeFlowType(type, (err) => {
      if (err) {
        dispatch(displayWarning(err.message));
      }
    });
    dispatch({
      type: actionConstants.SET_FIRST_TIME_FLOW_TYPE,
      value: type,
    });
  };
}

export function setSelectedSettingsRpcUrl(newRpcUrl) {
  return {
    type: actionConstants.SET_SELECTED_SETTINGS_RPC_URL,
    value: newRpcUrl,
  };
}

export function setNetworksTabAddMode(isInAddMode) {
  return {
    type: actionConstants.SET_NETWORKS_TAB_ADD_MODE,
    value: isInAddMode,
  };
}

export function setLastActiveTime() {
  return (dispatch) => {
    background.setLastActiveTime((err) => {
      if (err) {
        dispatch(displayWarning(err.message));
      }
    });
  };
}

export function setConnectedStatusPopoverHasBeenShown() {
  return () => {
    background.setConnectedStatusPopoverHasBeenShown((err) => {
      if (err) {
        throw new Error(err.message);
      }
    });
  };
}

export function setAlertEnabledness(alertId, enabledness) {
  return async () => {
    await promisifiedBackground.setAlertEnabledness(alertId, enabledness);
  };
}

export async function setUnconnectedAccountAlertShown(origin) {
  await promisifiedBackground.setUnconnectedAccountAlertShown(origin);
}

export function getContractMethodData(data = '') {
  return (_dispatch, getState) => {
    const prefixedData = ethUtil.addHexPrefix(data);
    const fourBytePrefix = prefixedData.slice(0, 10);
    const { knownMethodData, use4ByteResolution } = getState().ecfWallet;

    if (
      (knownMethodData &&
        knownMethodData[fourBytePrefix] &&
        Object.keys(knownMethodData[fourBytePrefix]).length !== 0) ||
      fourBytePrefix === '0x'
    ) {
      return Promise.resolve(knownMethodData[fourBytePrefix]);
    }

    log.debug(`loadingMethodData`);

    return getMethodDataAsync(
      fourBytePrefix,
      use4ByteResolution !== false,
    ).then(({ name, params }) => {
      background.addKnownMethodData(fourBytePrefix, { name, params });
      return { name, params };
    });
  };
}

export function getTokenParams(tokenAddress) {
  return (dispatch, getState) => {
    const existingToken = getState().ecfWallet.tokens.find(
      ({ address }) => tokenAddress === address,
    );

    if (existingToken) {
      return Promise.resolve({
        symbol: existingToken.symbol,
        decimals: existingToken.decimals,
      });
    }

    log.debug(`loadingTokenParams`);

    return fetchSymbolAndDecimals(tokenAddress).then(({ symbol, decimals }) => {
      dispatch(addToken(tokenAddress, symbol, Number(decimals)));
      return undefined;
    });
  };
}

export function setSeedPhraseBackedUp(seedPhraseBackupState) {
  return (dispatch) => {
    log.debug(`background.setSeedPhraseBackedUp`);
    return callAndRefreshState(dispatch, () =>
      promisifiedBackground.setSeedPhraseBackedUp(seedPhraseBackupState),
    );
  };
}

export function setOpenEcfWalletTabsIDs(openEcfWalletTabIDs) {
  return {
    type: actionConstants.SET_OPEN_ECF_WALLET_TAB_IDS,
    value: openEcfWalletTabIDs,
  };
}

export function getOpenEcfWalletTabsIds() {
  return async (dispatch) => {
    const openEcfWalletTabIDs =
      await promisifiedBackground.getOpenEcfWalletTabsIds();
    dispatch(setOpenEcfWalletTabsIDs(openEcfWalletTabIDs));
  };
}
