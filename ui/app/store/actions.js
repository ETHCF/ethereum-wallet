import pify from 'pify'
import * as ethUtil from '@ethereumjs/util'
import log from 'loglevel'
import { checksumAddress } from '../helpers/utils/util'
import { calcTokenBalance, estimateGas } from '../pages/send/send.utils'
import { fetchLocale } from '../helpers/utils/i18n-helper'
import { getMethodDataAsync } from '../helpers/utils/transactions.util'
import { fetchSymbolAndDecimals } from '../helpers/utils/token-util'
import switchDirection from '../helpers/utils/switch-direction'
import { ENVIRONMENT_TYPE_NOTIFICATION } from '../../../app/scripts/lib/enums'
import { encodeCall } from '../../../app/scripts/lib/contract-call'
import { hasUnconfirmedTransactions } from '../helpers/utils/confirm-tx.util'
import { setCustomGasLimit } from '../ducks/gas/gas.duck'
import txHelper from '../../lib/tx-helper'
import { getEnvironmentType } from '../../../app/scripts/lib/util'
import {
  getPermittedAccountsForCurrentTab,
  getSelectedAddress,
} from '../selectors'
import { switchedToUnconnectedAccount } from '../ducks/alerts/unconnected-account'
import { getUnconnectedAccountAlertEnabledness } from '../ducks/ecf-wallet/ecf-wallet'
import * as actionConstants from './actionConstants'

let background = null
let promisifiedBackground = null
export function _setBackgroundConnection (backgroundConnection) {
  background = backgroundConnection
  promisifiedBackground = pify(background)
}

export function goHome () {
  return {
    type: actionConstants.GO_HOME,
  }
}

// async actions

export function tryUnlockEcfWallet (password) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    dispatch(unlockInProgress())
    log.debug(`background.submitPassword`)

    try {
      await new Promise((resolve, reject) => {
        background.submitPassword(password, (error) => (error ? reject(error) : resolve()))
      })
    } catch (error) {
      log.error('ecf-wallet - submitPassword failed', error)
      dispatch(unlockFailed(error.message))
      dispatch(hideLoadingIndication())
      throw error
    }

    dispatch(unlockSucceeded())

    // The vault is open from here on. Refreshing state and verifying the seed
    // phrase both reach the network, and failing either does not mean the
    // unlock failed, so they must not reject.
    try {
      await forceUpdateEcfWalletState(dispatch)
      await new Promise((resolve, reject) => {
        background.verifySeedPhrase((err) => (err ? reject(err) : resolve()))
      })
    } catch (error) {
      log.error('ecf-wallet - unlocked, but could not finish loading', error)
    }

    dispatch(hideLoadingIndication())
  }
}

export function createNewVaultAndRestore (password, seed) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.createNewVaultAndRestore`)
    let vault
    return new Promise((resolve, reject) => {
      background.createNewVaultAndRestore(password, seed, (err, _vault) => {
        if (err) {
          reject(err)
          return
        }
        vault = _vault
        resolve()
      })
    })
      .then(() => dispatch(unMarkPasswordForgotten()))
      .then(() => {
        dispatch(showAccountsPage())
        dispatch(hideLoadingIndication())
        return vault
      })
      .catch((err) => {
        dispatch(displayWarning(err.message))
        dispatch(hideLoadingIndication())
        return Promise.reject(err)
      })
  }
}

export function createNewVaultAndGetSeedPhrase (password) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    try {
      await createNewVault(password)
      const seedWords = await verifySeedPhrase()
      dispatch(hideLoadingIndication())
      return seedWords
    } catch (error) {
      dispatch(hideLoadingIndication())
      dispatch(displayWarning(error.message))
      throw new Error(error.message)
    }
  }
}

export function unlockAndGetSeedPhrase (password) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    try {
      await submitPassword(password)
      const seedWords = await verifySeedPhrase()
      await forceUpdateEcfWalletState(dispatch)
      dispatch(hideLoadingIndication())
      return seedWords
    } catch (error) {
      dispatch(hideLoadingIndication())
      dispatch(displayWarning(error.message))
      throw new Error(error.message)
    }
  }
}

export function submitPassword (password) {
  return new Promise((resolve, reject) => {
    background.submitPassword(password, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

export function createNewVault (password) {
  return new Promise((resolve, reject) => {
    background.createNewVaultAndKeychain(password, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve(true)
    })
  })
}

export function verifyPassword (password) {
  return new Promise((resolve, reject) => {
    background.verifyPassword(password, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve(true)
    })
  })
}

export function verifySeedPhrase () {
  return new Promise((resolve, reject) => {
    background.verifySeedPhrase((error, seedWords) => {
      if (error) {
        reject(error)
        return
      }

      resolve(seedWords)
    })
  })
}

export function requestRevealSeedWords (password) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.verifyPassword`)

    try {
      await verifyPassword(password)
      const seedWords = await verifySeedPhrase()
      dispatch(hideLoadingIndication())
      return seedWords
    } catch (error) {
      dispatch(hideLoadingIndication())
      dispatch(displayWarning(error.message))
      throw new Error(error.message)
    }
  }
}

export function tryReverseResolveAddress (address) {
  return () => {
    return new Promise((resolve) => {
      background.tryReverseResolveAddress(address, (err) => {
        if (err) {
          log.error(err)
        }
        resolve()
      })
    })
  }
}

export function approveNetworkRequest (id) {
  return () => promisifiedBackground.approveNetworkRequest(id)
}

export function rejectNetworkRequest (id) {
  return () => promisifiedBackground.rejectNetworkRequest(id)
}

export function scheduleClipboardClear () {
  return () => promisifiedBackground.scheduleClipboardClear()
}

export function clearClipboard () {
  return () => promisifiedBackground.clearClipboard()
}

export function resetAccount () {
  return (dispatch) => {
    dispatch(showLoadingIndication())

    return new Promise((resolve, reject) => {
      background.resetAccount((err, account) => {
        dispatch(hideLoadingIndication())
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        log.info(`Transaction history reset for ${account}`)
        dispatch(showAccountsPage())
        resolve(account)
      })
    })
  }
}

export function removeAccount (address) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    try {
      await new Promise((resolve, reject) => {
        background.removeAccount(address, (error, account) => {
          if (error) {
            reject(error)
            return
          }
          resolve(account)
        })
      })
      await forceUpdateEcfWalletState(dispatch)
    } catch (error) {
      dispatch(displayWarning(error.message))
      throw error
    } finally {
      dispatch(hideLoadingIndication())
    }

    log.info(`Account removed: ${address}`)
    dispatch(showAccountsPage())
  }
}

export function importNewAccount (strategy, args) {
  return async (dispatch) => {
    let newState
    dispatch(showLoadingIndication('This may take a while, please be patient.'))
    try {
      log.debug(`background.importAccountWithStrategy`)
      await promisifiedBackground.importAccountWithStrategy(strategy, args)
      log.debug(`background.getState`)
      newState = await promisifiedBackground.getState()
    } catch (err) {
      dispatch(hideLoadingIndication())
      dispatch(displayWarning(err.message))
      throw err
    }
    dispatch(hideLoadingIndication())
    dispatch(updateEcfWalletState(newState))
    if (newState.selectedAddress) {
      dispatch({
        type: actionConstants.SHOW_ACCOUNT_DETAIL,
        value: newState.selectedAddress,
      })
    }
    return newState
  }
}

export function addNewAccount () {
  log.debug(`background.addNewAccount`)
  return async (dispatch, getState) => {
    const oldIdentities = getState().ecfWallet.identities
    dispatch(showLoadingIndication())

    let newIdentities
    try {
      const { identities } = await promisifiedBackground.addNewAccount()
      newIdentities = identities
    } catch (error) {
      dispatch(displayWarning(error.message))
      throw error
    }
    const newAccountAddress = Object.keys(newIdentities).find((address) => !oldIdentities[address])
    dispatch(hideLoadingIndication())
    await forceUpdateEcfWalletState(dispatch)
    return newAccountAddress
  }
}

export function checkHardwareStatus (deviceName, hdPath) {
  log.debug(`background.checkHardwareStatus`, deviceName, hdPath)
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    let unlocked
    try {
      unlocked = await promisifiedBackground.checkHardwareStatus(deviceName, hdPath)
    } catch (error) {
      // Leaving the loading overlay up would block every click on the page.
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }

    dispatch(hideLoadingIndication())
    await forceUpdateEcfWalletState(dispatch)
    return unlocked
  }
}

export function forgetDevice (deviceName) {
  log.debug(`background.forgetDevice`, deviceName)
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    try {
      await promisifiedBackground.forgetDevice(deviceName)
    } catch (error) {
      // Leaving the loading overlay up would block every click on the page.
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }

    dispatch(hideLoadingIndication())
    await forceUpdateEcfWalletState(dispatch)
  }
}

export function connectHardware (deviceName, page, hdPath) {
  log.debug(`background.connectHardware`, deviceName, page, hdPath)
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    let accounts
    try {
      accounts = await promisifiedBackground.connectHardware(deviceName, page, hdPath)
    } catch (error) {
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }
    dispatch(hideLoadingIndication())
    await forceUpdateEcfWalletState(dispatch)

    return accounts
  }
}

export function unlockHardwareWalletAccount (index, deviceName, hdPath) {
  log.debug(`background.unlockHardwareWalletAccount`, index, deviceName, hdPath)
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.unlockHardwareWalletAccount(index, deviceName, hdPath, (err) => {
        dispatch(hideLoadingIndication())
        if (err) {
          log.error(err)
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        resolve()
      })
    })
  }
}

export function signPersonalMsg (msgData) {
  log.debug('action - signPersonalMsg')
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`actions calling background.signPersonalMessage`)

    let newState
    try {
      newState = await promisifiedBackground.signPersonalMessage(msgData)
    } catch (error) {
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }
    dispatch(hideLoadingIndication())
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.ecfWalletId))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function decryptMsgInline (decryptedMsgData) {
  log.debug('action - decryptMsgInline')
  return async (dispatch) => {
    log.debug(`actions calling background.decryptMessageInline`)

    let newState
    try {
      newState = await promisifiedBackground.decryptMessageInline(decryptedMsgData)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }

    dispatch(updateEcfWalletState(newState))
    return newState.unapprovedDecryptMsgs[decryptedMsgData.ecfWalletId]
  }
}

export function decryptMsg (decryptedMsgData) {
  log.debug('action - decryptMsg')
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`actions calling background.decryptMessage`)

    let newState
    try {
      newState = await promisifiedBackground.decryptMessage(decryptedMsgData)
    } catch (error) {
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }
    dispatch(hideLoadingIndication())
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(decryptedMsgData.ecfWalletId))
    dispatch(closeCurrentNotificationWindow())
    return decryptedMsgData
  }
}

export function encryptionPublicKeyMsg (msgData) {
  log.debug('action - encryptionPublicKeyMsg')
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`actions calling background.encryptionPublicKey`)

    let newState
    try {
      newState = await promisifiedBackground.encryptionPublicKey(msgData)
    } catch (error) {
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }
    dispatch(hideLoadingIndication())
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.ecfWalletId))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function signTypedMsg (msgData) {
  log.debug('action - signTypedMsg')
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`actions calling background.signTypedMessage`)

    let newState
    try {
      newState = await promisifiedBackground.signTypedMessage(msgData)
    } catch (error) {
      dispatch(hideLoadingIndication())
      log.error(error)
      dispatch(displayWarning(error.message))
      throw error
    }
    dispatch(hideLoadingIndication())
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.ecfWalletId))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function signTx (txData) {
  return (dispatch) => {
    global.ethQuery.sendTransaction(txData, (err) => {
      if (err) {
        dispatch(displayWarning(err.message))
      }
    })
    dispatch(showConfTxPage())
  }
}

export function setGasLimit (gasLimit) {
  return {
    type: actionConstants.UPDATE_GAS_LIMIT,
    value: gasLimit,
  }
}

export function setGasPrice (gasPrice) {
  return {
    type: actionConstants.UPDATE_GAS_PRICE,
    value: gasPrice,
  }
}

export function setGasTotal (gasTotal) {
  return {
    type: actionConstants.UPDATE_GAS_TOTAL,
    value: gasTotal,
  }
}

export function updateGasData ({
  gasPrice,
  blockGasLimit,
  selectedAddress,
  sendToken,
  to,
  value,
  data,
}) {
  return (dispatch) => {
    dispatch(gasLoadingStarted())
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
        dispatch(setGasLimit(gas))
        dispatch(setCustomGasLimit(gas))
        dispatch(updateSendErrors({ gasLoadingError: null }))
        dispatch(gasLoadingFinished())
      })
      .catch((err) => {
        log.error(err)
        dispatch(updateSendErrors({ gasLoadingError: 'gasLoadingError' }))
        dispatch(gasLoadingFinished())
      })
  }
}

export function gasLoadingStarted () {
  return {
    type: actionConstants.GAS_LOADING_STARTED,
  }
}

export function gasLoadingFinished () {
  return {
    type: actionConstants.GAS_LOADING_FINISHED,
  }
}

export function updateSendTokenBalance ({
  sendToken,
  tokenContract,
  address,
}) {
  return (dispatch) => {
    const tokenBalancePromise = tokenContract
      ? tokenContract.balanceOf(address)
      : Promise.resolve()
    return tokenBalancePromise
      .then((usersToken) => {
        if (usersToken) {
          const newTokenBalance = calcTokenBalance({ sendToken, usersToken })
          dispatch(setSendTokenBalance(newTokenBalance))
        }
      })
      .catch((err) => {
        log.error(err)
        updateSendErrors({ tokenBalance: 'tokenBalanceError' })
      })
  }
}

export function updateSendErrors (errorObject) {
  return {
    type: actionConstants.UPDATE_SEND_ERRORS,
    value: errorObject,
  }
}

export function setSendTokenBalance (tokenBalance) {
  return {
    type: actionConstants.UPDATE_SEND_TOKEN_BALANCE,
    value: tokenBalance,
  }
}

export function updateSendHexData (value) {
  return {
    type: actionConstants.UPDATE_SEND_HEX_DATA,
    value,
  }
}

export function updateSendTo (to, nickname = '') {
  return {
    type: actionConstants.UPDATE_SEND_TO,
    value: { to, nickname },
  }
}

export function updateSendAmount (amount) {
  return {
    type: actionConstants.UPDATE_SEND_AMOUNT,
    value: amount,
  }
}

export function updateCustomNonce (value) {
  return {
    type: actionConstants.UPDATE_CUSTOM_NONCE,
    value,
  }
}

export function setMaxModeTo (bool) {
  return {
    type: actionConstants.UPDATE_MAX_MODE,
    value: bool,
  }
}

export function updateSend (newSend) {
  return {
    type: actionConstants.UPDATE_SEND,
    value: newSend,
  }
}

export function updateSendToken (token) {
  return {
    type: actionConstants.UPDATE_SEND_TOKEN,
    value: token,
  }
}

export function clearSend () {
  return {
    type: actionConstants.CLEAR_SEND,
  }
}

export function updateSendEnsResolution (ensResolution) {
  return {
    type: actionConstants.UPDATE_SEND_ENS_RESOLUTION,
    payload: ensResolution,
  }
}

export function updateSendEnsResolutionError (errorMessage) {
  return {
    type: actionConstants.UPDATE_SEND_ENS_RESOLUTION_ERROR,
    payload: errorMessage,
  }
}

export function signTokenTx (tokenAddress, toAddress, amount, txData) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    pify(global.ethQuery).sendTransaction({
      ...txData,
      to: tokenAddress,
      data: encodeCall('transfer(address,uint256)', [toAddress, ethUtil.addHexPrefix(amount)]),
    })
      .catch((err) => {
        dispatch(hideLoadingIndication())
        dispatch(displayWarning(err.message))
      })
    dispatch(showConfTxPage())
  }
}

const updateEcfWalletStateFromBackground = () => {
  log.debug(`background.getState`)

  return new Promise((resolve, reject) => {
    background.getState((error, newState) => {
      if (error) {
        reject(error)
        return
      }

      resolve(newState)
    })
  })
}

export function updateTransaction (txData) {
  return (dispatch) => {
    dispatch(showLoadingIndication())

    return new Promise((resolve, reject) => {
      background.updateTransaction(txData, (err) => {
        dispatch(updateTransactionParams(txData.id, txData.txParams))
        if (err) {
          dispatch(txError(err))
          dispatch(goHome())
          log.error(err.message)
          reject(err)
          return
        }

        resolve(txData)
      })
    })
      .then(() => updateEcfWalletStateFromBackground())
      .then((newState) => dispatch(updateEcfWalletState(newState)))
      .then(() => {
        dispatch(showConfTxPage({ id: txData.id }))
        dispatch(hideLoadingIndication())
        return txData
      })
  }
}

export function updateAndApproveTx (txData) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.updateAndApproveTransaction(txData, (err) => {
        dispatch(updateTransactionParams(txData.id, txData.txParams))
        dispatch(clearSend())

        if (err) {
          dispatch(txError(err))
          dispatch(goHome())
          log.error(err.message)
          reject(err)
          return
        }

        resolve(txData)
      })
    })
      .then(() => updateEcfWalletStateFromBackground())
      .then((newState) => dispatch(updateEcfWalletState(newState)))
      .then(() => {
        dispatch(clearSend())
        dispatch(completedTx(txData.id))
        dispatch(hideLoadingIndication())
        dispatch(updateCustomNonce(''))
        dispatch(closeCurrentNotificationWindow())

        return txData
      })
      .catch((err) => {
        dispatch(hideLoadingIndication())
        return Promise.reject(err)
      })
  }
}

export function completedTx (id) {
  return (dispatch, getState) => {
    const state = getState()
    const {
      unapprovedTxs,
      unapprovedMsgs,
      unapprovedPersonalMsgs,
      unapprovedTypedMessages,
      network,
    } = state.ecfWallet
    const unconfirmedActions = txHelper(unapprovedTxs, unapprovedMsgs, unapprovedPersonalMsgs, unapprovedTypedMessages, network)
    const otherUnconfirmedActions = unconfirmedActions.filter((tx) => tx.id !== id)
    dispatch({
      type: actionConstants.COMPLETED_TX,
      value: {
        id,
        unconfirmedActionsCount: otherUnconfirmedActions.length,
      },
    })
  }
}

export function updateTransactionParams (id, txParams) {
  return {
    type: actionConstants.UPDATE_TRANSACTION_PARAMS,
    id,
    value: txParams,
  }
}

export function txError (err) {
  return {
    type: actionConstants.TRANSACTION_ERROR,
    message: err.message,
  }
}

export function cancelPersonalMsg (msgData) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    let newState
    try {
      newState = await promisifiedBackground.cancelPersonalMessage(msgData.id)
    } finally {
      dispatch(hideLoadingIndication())
    }
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.id))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function cancelDecryptMsg (msgData) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    let newState
    try {
      newState = await promisifiedBackground.cancelDecryptMessage(msgData.id)
    } finally {
      dispatch(hideLoadingIndication())
    }
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.id))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function cancelEncryptionPublicKeyMsg (msgData) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    let newState
    try {
      newState = await promisifiedBackground.cancelEncryptionPublicKey(msgData.id)
    } finally {
      dispatch(hideLoadingIndication())
    }
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.id))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function cancelTypedMsg (msgData) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    let newState
    try {
      newState = await promisifiedBackground.cancelTypedMessage(msgData.id)
    } finally {
      dispatch(hideLoadingIndication())
    }
    dispatch(updateEcfWalletState(newState))
    dispatch(completedTx(msgData.id))
    dispatch(closeCurrentNotificationWindow())
    return msgData
  }
}

export function cancelTx (txData) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.cancelTransaction(txData.id, (err) => {
        if (err) {
          reject(err)
          return
        }

        resolve()
      })
    })
      .then(() => updateEcfWalletStateFromBackground())
      .then((newState) => dispatch(updateEcfWalletState(newState)))
      .then(() => {
        dispatch(clearSend())
        dispatch(completedTx(txData.id))
        dispatch(hideLoadingIndication())
        dispatch(closeCurrentNotificationWindow())

        return txData
      })
  }
}

/**
 * Cancels all of the given transactions
 * @param {Array<object>} txDataList - a list of tx data objects
 * @returns {function(*): Promise<void>}
 */
export function cancelTxs (txDataList) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    const txIds = txDataList.map(({ id }) => id)
    const cancellations = txIds.map((id) => new Promise((resolve, reject) => {
      background.cancelTransaction(id, (err) => {
        if (err) {
          reject(err)
          return
        }

        resolve()
      })
    }))

    await Promise.all(cancellations)
    const newState = await updateEcfWalletStateFromBackground()
    dispatch(updateEcfWalletState(newState))
    dispatch(clearSend())

    txIds.forEach((id) => {
      dispatch(completedTx(id))
    })

    dispatch(hideLoadingIndication())

    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      global.platform.closeCurrentWindow()

    }
  }
}

export function markPasswordForgotten () {
  return async (dispatch) => {
    try {
      await new Promise((resolve, reject) => {
        return background.markPasswordForgotten((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()

        })
      })
    } finally {
      // TODO: handle errors
      dispatch(hideLoadingIndication())
      dispatch(forgotPassword())
      await forceUpdateEcfWalletState(dispatch)
    }
  }
}

export function unMarkPasswordForgotten () {
  return (dispatch) => {
    return new Promise((resolve) => {
      background.unMarkPasswordForgotten(() => {
        dispatch(forgotPassword(false))
        resolve()
      })
    })
      .then(() => forceUpdateEcfWalletState(dispatch))
  }
}

export function forgotPassword (forgotPasswordState = true) {
  return {
    type: actionConstants.FORGOT_PASSWORD,
    value: forgotPasswordState,
  }
}

export function closeWelcomeScreen () {
  return {
    type: actionConstants.CLOSE_WELCOME_SCREEN,
  }
}

//
// unlock screen
//

export function unlockInProgress () {
  return {
    type: actionConstants.UNLOCK_IN_PROGRESS,
  }
}

export function unlockFailed (message) {
  return {
    type: actionConstants.UNLOCK_FAILED,
    value: message,
  }
}

export function unlockSucceeded (message) {
  return {
    type: actionConstants.UNLOCK_SUCCEEDED,
    value: message,
  }
}

export function updateEcfWalletState (newState) {
  return (dispatch, getState) => {
    const { ecfWallet: currentState } = getState()

    const {
      currentLocale,
      selectedAddress,
    } = currentState
    const {
      currentLocale: newLocale,
      selectedAddress: newSelectedAddress,
    } = newState

    if (currentLocale && newLocale && currentLocale !== newLocale) {
      dispatch(updateCurrentLocale(newLocale))
    }
    if (selectedAddress !== newSelectedAddress) {
      dispatch({ type: actionConstants.SELECTED_ADDRESS_CHANGED })
    }

    dispatch({
      type: actionConstants.UPDATE_ECF_WALLET_STATE,
      value: newState,
    })
  }
}

const backgroundSetLocked = () => {
  return new Promise((resolve, reject) => {
    background.setLocked((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export function lockEcfWallet () {
  log.debug(`background.setLocked`)

  return (dispatch) => {
    dispatch(showLoadingIndication())

    return backgroundSetLocked()
      .then(() => updateEcfWalletStateFromBackground())
      .catch((error) => {
        dispatch(displayWarning(error.message))
        return Promise.reject(error)
      })
      .then((newState) => {
        dispatch(updateEcfWalletState(newState))
        dispatch(hideLoadingIndication())
        dispatch({ type: actionConstants.LOCK_ECF_WALLET })
      })
      .catch(() => {
        dispatch(hideLoadingIndication())
        dispatch({ type: actionConstants.LOCK_ECF_WALLET })
      })
  }
}

async function _setSelectedAddress (dispatch, address) {
  log.debug(`background.setSelectedAddress`)
  const tokens = await promisifiedBackground.setSelectedAddress(address)
  dispatch(updateTokens(tokens))
}

export function setSelectedAddress (address) {
  return async (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.setSelectedAddress`)
    try {
      await _setSelectedAddress(dispatch, address)
    } catch (error) {
      dispatch(hideLoadingIndication())
      dispatch(displayWarning(error.message))
      return
    }
    dispatch(hideLoadingIndication())
  }
}

export function showAccountDetail (address) {
  return async (dispatch, getState) => {
    dispatch(showLoadingIndication())
    log.debug(`background.setSelectedAddress`)

    const state = getState()
    const unconnectedAccountAccountAlertIsEnabled = getUnconnectedAccountAlertEnabledness(state)
    const activeTabOrigin = state.activeTab.origin
    const selectedAddress = getSelectedAddress(state)
    const permittedAccountsForCurrentTab = getPermittedAccountsForCurrentTab(state)
    const currentTabIsConnectedToPreviousAddress = Boolean(activeTabOrigin) && permittedAccountsForCurrentTab.includes(selectedAddress)
    const currentTabIsConnectedToNextAddress = Boolean(activeTabOrigin) && permittedAccountsForCurrentTab.includes(address)
    const switchingToUnconnectedAddress = currentTabIsConnectedToPreviousAddress && !currentTabIsConnectedToNextAddress

    try {
      await _setSelectedAddress(dispatch, address)
    } catch (error) {
      dispatch(hideLoadingIndication())
      dispatch(displayWarning(error.message))
      return
    }
    dispatch(hideLoadingIndication())
    dispatch({
      type: actionConstants.SHOW_ACCOUNT_DETAIL,
      value: address,
    })
    if (unconnectedAccountAccountAlertIsEnabled && switchingToUnconnectedAddress) {
      dispatch(switchedToUnconnectedAccount())
      await setUnconnectedAccountAlertShown(activeTabOrigin)
    }
  }
}

export function addPermittedAccount (origin, address) {
  return async (dispatch) => {
    await new Promise((resolve, reject) => {
      background.addPermittedAccount(origin, address, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    await forceUpdateEcfWalletState(dispatch)
  }
}

export function removePermittedAccount (origin, address) {
  return async (dispatch) => {
    await new Promise((resolve, reject) => {
      background.removePermittedAccount(origin, address, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    await forceUpdateEcfWalletState(dispatch)
  }
}

export function showAccountsPage () {
  return {
    type: actionConstants.SHOW_ACCOUNTS_PAGE,
  }
}

export function showConfTxPage ({ id } = {}) {
  return {
    type: actionConstants.SHOW_CONF_TX_PAGE,
    id,
  }
}

export function addToken (address, symbol, decimals, image) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.addToken(address, symbol, decimals, image, (err, tokens) => {
        dispatch(hideLoadingIndication())
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }
        dispatch(updateTokens(tokens))
        resolve(tokens)
      })
    })
  }
}

export function removeToken (address) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.removeToken(address, (err, tokens) => {
        dispatch(hideLoadingIndication())
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }
        dispatch(updateTokens(tokens))
        resolve(tokens)
      })
    })
  }
}

export function addTokens (tokens) {
  return (dispatch) => {
    if (Array.isArray(tokens)) {
      return Promise.all(tokens.map(({ address, symbol, decimals }) => (
        dispatch(addToken(address, symbol, decimals))
      )))
    }
    return Promise.all(
      Object
        .entries(tokens)
        .map(([_, { address, symbol, decimals }]) => (
          dispatch(addToken(address, symbol, decimals))
        )),
    )

  }
}

export function removeSuggestedTokens () {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve) => {
      background.removeSuggestedTokens((err, suggestedTokens) => {
        dispatch(hideLoadingIndication())
        if (err) {
          dispatch(displayWarning(err.message))
        }
        dispatch(clearPendingTokens())
        if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
          global.platform.closeCurrentWindow()
          return
        }
        resolve(suggestedTokens)
      })
    })
      .then(() => updateEcfWalletStateFromBackground())
      .then((suggestedTokens) => dispatch(updateEcfWalletState({ ...suggestedTokens })))
  }
}

export function addKnownMethodData (fourBytePrefix, methodData) {
  return () => {
    background.addKnownMethodData(fourBytePrefix, methodData)
  }
}

export function updateTokens (newTokens) {
  return {
    type: actionConstants.UPDATE_TOKENS,
    newTokens,
  }
}

export function clearPendingTokens () {
  return {
    type: actionConstants.CLEAR_PENDING_TOKENS,
  }
}

export function createCancelTransaction (txId, customGasPrice) {
  log.debug('background.cancelTransaction')
  let newTxId

  return (dispatch) => {
    return new Promise((resolve, reject) => {
      background.createCancelTransaction(txId, customGasPrice, (err, newState) => {
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        const { currentNetworkTxList } = newState
        const { id } = currentNetworkTxList[currentNetworkTxList.length - 1]
        newTxId = id
        resolve(newState)
      })
    })
      .then((newState) => dispatch(updateEcfWalletState(newState)))
      .then(() => newTxId)
  }
}

export function createSpeedUpTransaction (txId, customGasPrice, customGasLimit) {
  log.debug('background.createSpeedUpTransaction')
  let newTx

  return (dispatch) => {
    return new Promise((resolve, reject) => {
      background.createSpeedUpTransaction(txId, customGasPrice, customGasLimit, (err, newState) => {
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        const { currentNetworkTxList } = newState
        newTx = currentNetworkTxList[currentNetworkTxList.length - 1]
        resolve(newState)
      })
    })
      .then((newState) => dispatch(updateEcfWalletState(newState)))
      .then(() => newTx)
  }
}

export function createRetryTransaction (txId, customGasPrice, customGasLimit) {
  log.debug('background.createRetryTransaction')
  let newTx

  return (dispatch) => {
    return new Promise((resolve, reject) => {
      background.createSpeedUpTransaction(txId, customGasPrice, customGasLimit, (err, newState) => {
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        const { currentNetworkTxList } = newState
        newTx = currentNetworkTxList[currentNetworkTxList.length - 1]
        resolve(newState)
      })
    })
      .then((newState) => dispatch(updateEcfWalletState(newState)))
      .then(() => newTx)
  }
}

//
// config
//

export function setProviderType (type) {
  return async (dispatch, getState) => {
    const { type: currentProviderType } = getState().ecfWallet.provider
    log.debug(`background.setProviderType`, type)

    try {
      await promisifiedBackground.setProviderType(type)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning('Had a problem changing networks!'))
      return
    }
    dispatch(setPreviousProvider(currentProviderType))
    dispatch(updateProviderType(type))
  }
}

export function updateProviderType (type) {
  return {
    type: actionConstants.SET_PROVIDER_TYPE,
    value: type,
  }
}

export function setPreviousProvider (type) {
  return {
    type: actionConstants.SET_PREVIOUS_PROVIDER,
    value: type,
  }
}

export function updateAndSetCustomRpc (newRpc, chainId, ticker = 'ETH', nickname, rpcPrefs) {
  return async (dispatch) => {
    log.debug(`background.updateAndSetCustomRpc: ${newRpc} ${chainId} ${ticker} ${nickname}`)

    try {
      await promisifiedBackground.updateAndSetCustomRpc(newRpc, chainId, ticker, nickname || newRpc, rpcPrefs)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning('Had a problem changing networks!'))
      return
    }

    dispatch({
      type: actionConstants.SET_RPC_TARGET,
      value: newRpc,
    })
  }
}

export function editRpc (oldRpc, newRpc, chainId, ticker = 'ETH', nickname, rpcPrefs) {
  return async (dispatch) => {
    log.debug(`background.delRpcTarget: ${oldRpc}`)
    try {
      promisifiedBackground.delCustomRpc(oldRpc)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning('Had a problem removing network!'))
      return
    }

    try {
      await promisifiedBackground.updateAndSetCustomRpc(newRpc, chainId, ticker, nickname || newRpc, rpcPrefs)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning('Had a problem changing networks!'))
      return
    }

    dispatch({
      type: actionConstants.SET_RPC_TARGET,
      value: newRpc,
    })
  }
}

export function setRpcTarget (newRpc, chainId, ticker = 'ETH', nickname) {
  return async (dispatch) => {
    log.debug(`background.setRpcTarget: ${newRpc} ${chainId} ${ticker} ${nickname}`)

    try {
      await promisifiedBackground.setCustomRpc(newRpc, chainId, ticker, nickname || newRpc)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning('Had a problem changing networks!'))
    }
  }
}

export function delRpcTarget (oldRpc) {
  return (dispatch) => {
    log.debug(`background.delRpcTarget: ${oldRpc}`)
    return new Promise((resolve, reject) => {
      background.delCustomRpc(oldRpc, (err) => {
        if (err) {
          log.error(err)
          dispatch(displayWarning('Had a problem removing network!'))
          reject(err)
          return
        }
        resolve()
      })
    })
  }
}

// Calls the addressBookController to add a new address.
export function addToAddressBook (recipient, nickname = '', memo = '') {
  log.debug(`background.addToAddressBook`)

  return async (dispatch, getState) => {
    const chainId = getState().ecfWallet.network

    let set
    try {
      set = await promisifiedBackground.setAddressBook(checksumAddress(recipient), nickname, chainId, memo)
    } catch (error) {
      log.error(error)
      dispatch(displayWarning('Address book failed to update'))
      throw error
    }
    if (!set) {
      dispatch(displayWarning('Address book failed to update'))
    }
  }
}

/**
 * @description Calls the addressBookController to remove an existing address.
 * @param {string} addressToRemove - Address of the entry to remove from the address book
 */
export function removeFromAddressBook (chainId, addressToRemove) {
  log.debug(`background.removeFromAddressBook`)

  return async () => {
    await promisifiedBackground.removeFromAddressBook(chainId, checksumAddress(addressToRemove))
  }
}

export function showNetworkDropdown () {
  return {
    type: actionConstants.NETWORK_DROPDOWN_OPEN,
  }
}

export function hideNetworkDropdown () {
  return {
    type: actionConstants.NETWORK_DROPDOWN_CLOSE,
  }
}

export function showModal (payload) {
  return {
    type: actionConstants.MODAL_OPEN,
    payload,
  }
}

export function hideModal (payload) {
  return {
    type: actionConstants.MODAL_CLOSE,
    payload,
  }
}

export function closeCurrentNotificationWindow () {
  return (dispatch, getState) => {
    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION &&
      !hasUnconfirmedTransactions(getState())) {
      global.platform.closeCurrentWindow()

      dispatch(closeNotificationWindow())
    }
  }
}

export function closeNotificationWindow () {
  return {
    type: actionConstants.CLOSE_NOTIFICATION_WINDOW,
  }
}

export function showSidebar ({ transitionName, type, props }) {
  return {
    type: actionConstants.SIDEBAR_OPEN,
    value: {
      transitionName,
      type,
      props,
    },
  }
}

export function hideSidebar () {
  return {
    type: actionConstants.SIDEBAR_CLOSE,
  }
}

export function showAlert (msg) {
  return {
    type: actionConstants.ALERT_OPEN,
    value: msg,
  }
}

export function hideAlert () {
  return {
    type: actionConstants.ALERT_CLOSE,
  }
}

export function showLoadingIndication (message) {
  return {
    type: actionConstants.SHOW_LOADING,
    value: message,
  }
}

export function setHardwareWalletDefaultHdPath ({ device, path }) {
  return {
    type: actionConstants.SET_HARDWARE_WALLET_DEFAULT_HD_PATH,
    value: { device, path },
  }
}

export function hideLoadingIndication () {
  return {
    type: actionConstants.HIDE_LOADING,
  }
}

export function displayWarning (text) {
  return {
    type: actionConstants.DISPLAY_WARNING,
    value: text,
  }
}

export function hideWarning () {
  return {
    type: actionConstants.HIDE_WARNING,
  }
}

export function exportAccount (password, address) {
  return function (dispatch) {
    dispatch(showLoadingIndication())

    log.debug(`background.submitPassword`)
    return new Promise((resolve, reject) => {
      background.submitPassword(password, function (err) {
        if (err) {
          log.error('Error in submitting password.')
          dispatch(hideLoadingIndication())
          dispatch(displayWarning('Incorrect Password.'))
          reject(err)
          return
        }
        log.debug(`background.exportAccount`)
        background.exportAccount(address, function (err2, result) {
          dispatch(hideLoadingIndication())

          if (err2) {
            log.error(err2)
            dispatch(displayWarning('Had a problem exporting the account.'))
            reject(err2)
            return
          }

          dispatch(showPrivateKey(result))
          resolve(result)
        })
      })
    })
  }
}

export function exportAccounts (password, addresses) {
  return function (dispatch) {
    log.debug(`background.submitPassword`)
    return new Promise((resolve, reject) => {
      background.submitPassword(password, function (err) {
        if (err) {
          log.error('Error in submitting password.')
          reject(err)
          return
        }
        log.debug(`background.exportAccounts`)
        const accountPromises = addresses.map((address) => new Promise(
          (resolve2, reject2) => background.exportAccount(address, function (err2, result) {
            if (err2) {
              log.error(err2)
              dispatch(displayWarning('Had a problem exporting the account.'))
              reject2(err2)
              return
            }
            resolve2(result)
          }),
        ))
        resolve(Promise.all(accountPromises))
      })
    })
  }
}

export function showPrivateKey (key) {
  return {
    type: actionConstants.SHOW_PRIVATE_KEY,
    value: key,
  }
}

export function setAccountLabel (account, label) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.setAccountLabel`)

    return new Promise((resolve, reject) => {
      background.setAccountLabel(account, label, (err) => {
        dispatch(hideLoadingIndication())

        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        dispatch({
          type: actionConstants.SET_ACCOUNT_LABEL,
          value: { account, label },
        })
        resolve(account)
      })
    })
  }
}

export function clearAccountDetails () {
  return {
    type: actionConstants.CLEAR_ACCOUNT_DETAILS,
  }
}

export function showSendTokenPage () {
  return {
    type: actionConstants.SHOW_SEND_TOKEN_PAGE,
  }
}

export function setFeatureFlag (feature, activated, notificationType) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.setFeatureFlag(feature, activated, (err, updatedFeatureFlags) => {
        dispatch(hideLoadingIndication())
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }
        dispatch(updateFeatureFlags(updatedFeatureFlags))
        notificationType && dispatch(showModal({ name: notificationType }))
        resolve(updatedFeatureFlags)
      })
    })
  }
}

export function updateFeatureFlags (updatedFeatureFlags) {
  return {
    type: actionConstants.UPDATE_FEATURE_FLAGS,
    value: updatedFeatureFlags,
  }
}

export function setPreference (preference, value) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return new Promise((resolve, reject) => {
      background.setPreference(preference, value, (err, updatedPreferences) => {
        dispatch(hideLoadingIndication())

        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }

        dispatch(updatePreferences(updatedPreferences))
        resolve(updatedPreferences)
      })
    })
  }
}

export function updatePreferences (value) {
  return {
    type: actionConstants.UPDATE_PREFERENCES,
    value,
  }
}

export function setDefaultHomeActiveTabName (value) {
  return async () => {
    await promisifiedBackground.setDefaultHomeActiveTabName(value)
  }
}

export function setThemePreference (value) {
  return setPreference('theme', value)
}

export function setAutoLockTimeLimit (value) {
  return setPreference('autoLockTimeLimit', value)
}

export function setCompletedOnboarding () {
  return async (dispatch) => {
    dispatch(showLoadingIndication())

    try {
      await promisifiedBackground.completeOnboarding()
    } catch (err) {
      dispatch(displayWarning(err.message))
      throw err
    }

    dispatch(completeOnboarding())
    dispatch(hideLoadingIndication())
  }
}

export function completeOnboarding () {
  return {
    type: actionConstants.COMPLETE_ONBOARDING,
  }
}

export function setMouseUserState (isMouseUser) {
  return {
    type: actionConstants.SET_MOUSE_USER_STATE,
    value: isMouseUser,
  }
}

export async function forceUpdateEcfWalletState (dispatch) {
  log.debug(`background.getState`)

  let newState
  try {
    newState = await promisifiedBackground.getState()
  } catch (error) {
    dispatch(displayWarning(error.message))
    throw error
  }

  dispatch(updateEcfWalletState(newState))
  return newState
}

export function toggleAccountMenu () {
  return {
    type: actionConstants.TOGGLE_ACCOUNT_MENU,
  }
}

export function setUseNonceField (val) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.setUseNonceField`)
    background.setUseNonceField(val, (err) => {
      dispatch(hideLoadingIndication())
      if (err) {
        dispatch(displayWarning(err.message))
      }
    })
    dispatch({
      type: actionConstants.SET_USE_NONCEFIELD,
      value: val,
    })
  }
}

export function setUsePhishDetect (val) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.setUsePhishDetect`)
    background.setUsePhishDetect(val, (err) => {
      dispatch(hideLoadingIndication())
      if (err) {
        dispatch(displayWarning(err.message))
      }
    })
  }
}

export function setIpfsGateway (val) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    log.debug(`background.setIpfsGateway`)
    background.setIpfsGateway(val, (err) => {
      dispatch(hideLoadingIndication())
      if (err) {
        dispatch(displayWarning(err.message))

      } else {
        dispatch({
          type: actionConstants.SET_IPFS_GATEWAY,
          value: val,
        })
      }
    })
  }
}

export function updateCurrentLocale (key) {
  return (dispatch) => {
    dispatch(showLoadingIndication())
    return fetchLocale(key)
      .then((localeMessages) => {
        log.debug(`background.setCurrentLocale`)
        background.setCurrentLocale(key, (err, textDirection) => {
          if (err) {
            dispatch(hideLoadingIndication())
            dispatch(displayWarning(err.message))
            return
          }
          switchDirection(textDirection)
          dispatch(setCurrentLocale(key, localeMessages))
          dispatch(hideLoadingIndication())
        })
      })
  }
}

export function setCurrentLocale (locale, messages) {
  return {
    type: actionConstants.SET_CURRENT_LOCALE,
    value: {
      locale,
      messages,
    },
  }
}

export function setPendingTokens (pendingTokens) {
  const { customToken = {}, selectedTokens = {} } = pendingTokens
  const { address, symbol, decimals } = customToken
  const tokens = address && symbol && decimals
    ? { ...selectedTokens, [address]: { ...customToken, isCustom: true } }
    : selectedTokens

  return {
    type: actionConstants.SET_PENDING_TOKENS,
    payload: tokens,
  }
}

// Permissions

export function requestAccountsPermissionWithId (origin) {
  return async (dispatch) => {
    const id = await promisifiedBackground.requestAccountsPermissionWithId(origin)
    await forceUpdateEcfWalletState(dispatch)
    return id
  }
}

/**
 * Approves the permissions request.
 * @param {Object} request - The permissions request to approve
 * @param {string[]} accounts - The accounts to expose, if any.
 */
export function approvePermissionsRequest (request, accounts) {
  return () => {
    background.approvePermissionsRequest(request, accounts)
  }
}

/**
 * Rejects the permissions request with the given ID.
 * @param {string} requestId - The id of the request to be rejected
 */
export function rejectPermissionsRequest (requestId) {
  return (dispatch) => {
    return new Promise((resolve, reject) => {
      background.rejectPermissionsRequest(requestId, (err) => {
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }
        forceUpdateEcfWalletState(dispatch)
          .then(resolve)
          .catch(reject)
      })
    })
  }
}

/**
 * Clears the given permissions for the given origin.
 */
export function removePermissionsFor (domains) {
  return () => {
    background.removePermissionsFor(domains)
  }
}

/**
 * Clears all permissions for all domains.
 */
export function clearPermissions () {
  return () => {
    background.clearPermissions()
  }
}

export function setFirstTimeFlowType (type) {
  return (dispatch) => {
    log.debug(`background.setFirstTimeFlowType`)
    background.setFirstTimeFlowType(type, (err) => {
      if (err) {
        dispatch(displayWarning(err.message))

      }
    })
    dispatch({
      type: actionConstants.SET_FIRST_TIME_FLOW_TYPE,
      value: type,
    })
  }
}

export function setSelectedSettingsRpcUrl (newRpcUrl) {
  return {
    type: actionConstants.SET_SELECTED_SETTINGS_RPC_URL,
    value: newRpcUrl,
  }
}

export function setNetworksTabAddMode (isInAddMode) {
  return {
    type: actionConstants.SET_NETWORKS_TAB_ADD_MODE,
    value: isInAddMode,
  }
}

export function setLastActiveTime () {
  return (dispatch) => {
    background.setLastActiveTime((err) => {
      if (err) {
        dispatch(displayWarning(err.message))

      }
    })
  }
}

export function setConnectedStatusPopoverHasBeenShown () {
  return () => {
    background.setConnectedStatusPopoverHasBeenShown((err) => {
      if (err) {
        throw new Error(err.message)
      }
    })
  }
}

export function setAlertEnabledness (alertId, enabledness) {
  return async () => {
    await promisifiedBackground.setAlertEnabledness(alertId, enabledness)
  }
}

export async function setUnconnectedAccountAlertShown (origin) {
  await promisifiedBackground.setUnconnectedAccountAlertShown(origin)
}

export function loadingMethodDataStarted () {
  return {
    type: actionConstants.LOADING_METHOD_DATA_STARTED,
  }
}

export function loadingMethodDataFinished () {
  return {
    type: actionConstants.LOADING_METHOD_DATA_FINISHED,
  }
}

export function getContractMethodData (data = '') {
  return (dispatch, getState) => {
    const prefixedData = ethUtil.addHexPrefix(data)
    const fourBytePrefix = prefixedData.slice(0, 10)
    const { knownMethodData } = getState().ecfWallet

    if ((knownMethodData && knownMethodData[fourBytePrefix] && Object.keys(knownMethodData[fourBytePrefix]).length !== 0) || fourBytePrefix === '0x') {
      return Promise.resolve(knownMethodData[fourBytePrefix])
    }

    dispatch(loadingMethodDataStarted())
    log.debug(`loadingMethodData`)

    return getMethodDataAsync(fourBytePrefix)
      .then(({ name, params }) => {
        dispatch(loadingMethodDataFinished())
        background.addKnownMethodData(fourBytePrefix, { name, params })
        return { name, params }
      })
  }
}

export function loadingTokenParamsStarted () {
  return {
    type: actionConstants.LOADING_TOKEN_PARAMS_STARTED,
  }
}

export function loadingTokenParamsFinished () {
  return {
    type: actionConstants.LOADING_TOKEN_PARAMS_FINISHED,
  }
}

export function getTokenParams (tokenAddress) {
  return (dispatch, getState) => {
    const existingTokens = getState().ecfWallet.tokens
    const existingToken = existingTokens.find(({ address }) => tokenAddress === address)

    if (existingToken) {
      return Promise.resolve({
        symbol: existingToken.symbol,
        decimals: existingToken.decimals,
      })
    }

    dispatch(loadingTokenParamsStarted())
    log.debug(`loadingTokenParams`)

    return fetchSymbolAndDecimals(tokenAddress, existingTokens)
      .then(({ symbol, decimals }) => {
        dispatch(addToken(tokenAddress, symbol, Number(decimals)))
        dispatch(loadingTokenParamsFinished())
      })
  }
}

export function setSeedPhraseBackedUp (seedPhraseBackupState) {
  return (dispatch) => {
    log.debug(`background.setSeedPhraseBackedUp`)
    return new Promise((resolve, reject) => {
      background.setSeedPhraseBackedUp(seedPhraseBackupState, (err) => {
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }
        forceUpdateEcfWalletState(dispatch)
          .then(resolve)
          .catch(reject)
      })
    })
  }
}

export function setNextNonce (nextNonce) {
  return {
    type: actionConstants.SET_NEXT_NONCE,
    value: nextNonce,
  }
}

export function getNextNonce () {
  return (dispatch, getState) => {
    const address = getState().ecfWallet.selectedAddress
    return new Promise((resolve, reject) => {
      background.getNextNonce(address, (err, nextNonce) => {
        if (err) {
          dispatch(displayWarning(err.message))
          reject(err)
          return
        }
        dispatch(setNextNonce(nextNonce))
        resolve(nextNonce)
      })
    })
  }
}

export function setRequestAccountTabIds (requestAccountTabIds) {
  return {
    type: actionConstants.SET_REQUEST_ACCOUNT_TABS,
    value: requestAccountTabIds,
  }
}

export function getRequestAccountTabIds () {
  return async (dispatch) => {
    const requestAccountTabIds = await promisifiedBackground.getRequestAccountTabIds()
    dispatch(setRequestAccountTabIds(requestAccountTabIds))
  }
}

export function setOpenEcfWalletTabsIDs (openEcfWalletTabIDs) {
  return {
    type: actionConstants.SET_OPEN_ECF_WALLET_TAB_IDS,
    value: openEcfWalletTabIDs,
  }
}

export function getOpenEcfWalletTabsIds () {
  return async (dispatch) => {
    const openEcfWalletTabIDs = await promisifiedBackground.getOpenEcfWalletTabsIds()
    dispatch(setOpenEcfWalletTabsIDs(openEcfWalletTabIDs))
  }
}

export function setCurrentWindowTab (currentWindowTab) {
  return {
    type: actionConstants.SET_CURRENT_WINDOW_TAB,
    value: currentWindowTab,
  }
}

export function getCurrentWindowTab () {
  return async (dispatch) => {
    const currentWindowTab = await global.platform.currentTab()
    dispatch(setCurrentWindowTab(currentWindowTab))
  }
}
