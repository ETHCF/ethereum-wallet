import * as actionConstants from '../../store/actionConstants'
import { ALERT_TYPES } from '../../../../app/scripts/controllers/alert'

export default function reduceEcfWallet (state = {}, action) {
  const ecfWalletState = {
    isInitialized: false,
    isUnlocked: false,
    isAccountMenuOpen: false,
    rpcTarget: 'https://rawtestrpc.metamask.io/',
    identities: {},
    unapprovedTxs: {},
    frequentRpcList: [],
    addressBook: [],
    contractExchangeRates: {},
    tokens: [],
    pendingTokens: {},
    customNonceValue: '',
    send: {
      gasLimit: null,
      gasPrice: null,
      gasTotal: null,
      tokenBalance: '0x0',
      from: '',
      to: '',
      amount: '0',
      memo: '',
      errors: {},
      maxModeOn: false,
      editingTransactionId: null,
      toNickname: '',
      ensResolution: null,
      ensResolutionError: '',
    },
    useBlockie: false,
    featureFlags: {},
    welcomeScreenSeen: false,
    currentLocale: '',
    preferences: {
      autoLockTimeLimit: undefined,
      showFiatInTestnets: false,
      useNativeCurrencyAsPrimaryCurrency: true,
    },
    firstTimeFlowType: null,
    completedOnboarding: false,
    knownMethodData: {},
    nextNonce: null,
    ...state,
  }

  switch (action.type) {

    case actionConstants.UPDATE_ECF_WALLET_STATE:
      return { ...ecfWalletState, ...action.value }

    case actionConstants.LOCK_ECF_WALLET:
      return {
        ...ecfWalletState,
        isUnlocked: false,
      }

    case actionConstants.SET_RPC_TARGET:
      return {
        ...ecfWalletState,
        provider: {
          type: 'rpc',
          rpcTarget: action.value,
        },
      }

    case actionConstants.SET_PROVIDER_TYPE:
      return {
        ...ecfWalletState,
        provider: {
          type: action.value,
        },
      }

    case actionConstants.SHOW_ACCOUNT_DETAIL:
      return {
        ...ecfWalletState,
        isUnlocked: true,
        isInitialized: true,
        selectedAddress: action.value,
      }

    case actionConstants.SET_ACCOUNT_LABEL: {
      const { account } = action.value
      const name = action.value.label
      const id = {}
      id[account] = { ...ecfWalletState.identities[account], name }
      const identities = { ...ecfWalletState.identities, ...id }
      return Object.assign(ecfWalletState, { identities })
    }

    case actionConstants.SET_CURRENT_FIAT:
      return Object.assign(ecfWalletState, {
        currentCurrency: action.value.currentCurrency,
        conversionRate: action.value.conversionRate,
        conversionDate: action.value.conversionDate,
      })

    case actionConstants.UPDATE_TOKENS:
      return {
        ...ecfWalletState,
        tokens: action.newTokens,
      }

    // ecf-wallet.send
    case actionConstants.UPDATE_GAS_LIMIT:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          gasLimit: action.value,
        },
      }
    case actionConstants.UPDATE_CUSTOM_NONCE:
      return {
        ...ecfWalletState,
        customNonceValue: action.value,
      }
    case actionConstants.UPDATE_GAS_PRICE:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          gasPrice: action.value,
        },
      }

    case actionConstants.TOGGLE_ACCOUNT_MENU:
      return {
        ...ecfWalletState,
        isAccountMenuOpen: !ecfWalletState.isAccountMenuOpen,
      }

    case actionConstants.UPDATE_GAS_TOTAL:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          gasTotal: action.value,
        },
      }

    case actionConstants.UPDATE_SEND_TOKEN_BALANCE:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          tokenBalance: action.value,
        },
      }

    case actionConstants.UPDATE_SEND_HEX_DATA:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          data: action.value,
        },
      }

    case actionConstants.UPDATE_SEND_TO:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          to: action.value.to,
          toNickname: action.value.nickname,
        },
      }

    case actionConstants.UPDATE_SEND_AMOUNT:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          amount: action.value,
        },
      }

    case actionConstants.UPDATE_MAX_MODE:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          maxModeOn: action.value,
        },
      }

    case actionConstants.UPDATE_SEND:
      return Object.assign(ecfWalletState, {
        send: {
          ...ecfWalletState.send,
          ...action.value,
        },
      })

    case actionConstants.UPDATE_SEND_TOKEN: {
      const newSend = {
        ...ecfWalletState.send,
        token: action.value,
      }
      // erase token-related state when switching back to native currency
      if (newSend.editingTransactionId && !newSend.token) {
        const unapprovedTx = newSend?.unapprovedTxs?.[newSend.editingTransactionId] || {}
        const txParams = unapprovedTx.txParams || {}
        Object.assign(newSend, {
          tokenBalance: null,
          balance: '0',
          from: unapprovedTx.from || '',
          unapprovedTxs: {
            ...newSend.unapprovedTxs,
            [newSend.editingTransactionId]: {
              ...unapprovedTx,
              txParams: {
                ...txParams,
                data: '',
              },
            },
          },
        })
      }
      return Object.assign(ecfWalletState, {
        send: newSend,
      })
    }

    case actionConstants.UPDATE_SEND_ENS_RESOLUTION:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          ensResolution: action.payload,
          ensResolutionError: '',
        },
      }

    case actionConstants.UPDATE_SEND_ENS_RESOLUTION_ERROR:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          ensResolution: null,
          ensResolutionError: action.payload,
        },
      }

    case actionConstants.CLEAR_SEND:
      return {
        ...ecfWalletState,
        send: {
          gasLimit: null,
          gasPrice: null,
          gasTotal: null,
          tokenBalance: null,
          from: '',
          to: '',
          amount: '0x0',
          memo: '',
          errors: {},
          maxModeOn: false,
          editingTransactionId: null,
          toNickname: '',
        },
      }

    case actionConstants.UPDATE_TRANSACTION_PARAMS: {
      const { id: txId, value } = action
      let { currentNetworkTxList } = ecfWalletState
      currentNetworkTxList = currentNetworkTxList.map((tx) => {
        if (tx.id === txId) {
          const newTx = { ...tx }
          newTx.txParams = value
          return newTx
        }
        return tx
      })

      return {
        ...ecfWalletState,
        currentNetworkTxList,
      }
    }

    case actionConstants.SET_USE_BLOCKIE:
      return {
        ...ecfWalletState,
        useBlockie: action.value,
      }

    case actionConstants.UPDATE_FEATURE_FLAGS:
      return {
        ...ecfWalletState,
        featureFlags: action.value,
      }

    case actionConstants.CLOSE_WELCOME_SCREEN:
      return {
        ...ecfWalletState,
        welcomeScreenSeen: true,
      }

    case actionConstants.SET_CURRENT_LOCALE:
      return {
        ...ecfWalletState,
        currentLocale: action.value.locale,
      }

    case actionConstants.SET_PENDING_TOKENS:
      return {
        ...ecfWalletState,
        pendingTokens: { ...action.payload },
      }

    case actionConstants.CLEAR_PENDING_TOKENS: {
      return {
        ...ecfWalletState,
        pendingTokens: {},
      }
    }

    case actionConstants.UPDATE_PREFERENCES: {
      return {
        ...ecfWalletState,
        preferences: {
          ...ecfWalletState.preferences,
          ...action.payload,
        },
      }
    }

    case actionConstants.COMPLETE_ONBOARDING: {
      return {
        ...ecfWalletState,
        completedOnboarding: true,
      }
    }

    case actionConstants.SET_FIRST_TIME_FLOW_TYPE: {
      return {
        ...ecfWalletState,
        firstTimeFlowType: action.value,
      }
    }

    case actionConstants.SET_NEXT_NONCE: {
      return {
        ...ecfWalletState,
        nextNonce: action.value,
      }
    }

    default:
      return ecfWalletState
  }
}

export const getCurrentLocale = (state) => state.ecfWallet.currentLocale

export const getAlertEnabledness = (state) => state.ecfWallet.alertEnabledness

export const getUnconnectedAccountAlertEnabledness = (state) => getAlertEnabledness(state)[ALERT_TYPES.unconnectedAccount]

export const getUnconnectedAccountAlertShown = (state) => state.ecfWallet.unconnectedAccountAlertShownOrigins

export const getTokens = (state) => state.ecfWallet.tokens
