import { ALERT_TYPES } from '../../../../app/scripts/controllers/alert';
import {
  CLEAR_PENDING_TOKENS,
  CLEAR_SEND,
  COMPLETE_ONBOARDING,
  LOCK_ECF_WALLET,
  SET_ACCOUNT_LABEL,
  SET_CURRENT_LOCALE,
  SET_FIRST_TIME_FLOW_TYPE,
  SET_PENDING_TOKENS,
  SET_PROVIDER_TYPE,
  SET_RPC_TARGET,
  SHOW_ACCOUNT_DETAIL,
  TOGGLE_ACCOUNT_MENU,
  UPDATE_ECF_WALLET_STATE,
  UPDATE_FEATURE_FLAGS,
  UPDATE_GAS_LIMIT,
  UPDATE_GAS_PRICE,
  UPDATE_GAS_TOTAL,
  UPDATE_MAX_MODE,
  UPDATE_PREFERENCES,
  UPDATE_SEND,
  UPDATE_SEND_AMOUNT,
  UPDATE_SEND_ENS_RESOLUTION,
  UPDATE_SEND_ENS_RESOLUTION_ERROR,
  UPDATE_SEND_HEX_DATA,
  UPDATE_SEND_TO,
  UPDATE_SEND_TOKEN,
  UPDATE_SEND_TOKEN_BALANCE,
  UPDATE_TOKENS,
  UPDATE_TRANSACTION_PARAMS,
} from '../../store/actionConstants';

export default function reduceEcfWallet(state = {}, action) {
  const ecfWalletState = {
    isInitialized: false,
    isUnlocked: false,
    isAccountMenuOpen: false,
    identities: {},
    unapprovedTxs: {},
    frequentRpcList: [],
    addressBook: [],
    tokens: [],
    pendingTokens: {},
    send: {
      gasLimit: null,
      gasPrice: null,
      // Whether the user chose gasPrice, rather than it being an estimate.
      gasPriceIsCustom: false,
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
    featureFlags: {},
    currentLocale: '',
    preferences: {
      autoLockTimeLimit: undefined,
      theme: 'os',
    },
    firstTimeFlowType: null,
    completedOnboarding: false,
    knownMethodData: {},
    ...state,
  };

  switch (action.type) {
    case UPDATE_ECF_WALLET_STATE:
      return { ...ecfWalletState, ...action.value };

    case LOCK_ECF_WALLET:
      return {
        ...ecfWalletState,
        isUnlocked: false,
      };

    case SET_RPC_TARGET:
      return {
        ...ecfWalletState,
        provider: {
          type: 'rpc',
          rpcTarget: action.value,
        },
      };

    case SET_PROVIDER_TYPE:
      return {
        ...ecfWalletState,
        provider: {
          type: action.value,
        },
      };

    case SHOW_ACCOUNT_DETAIL:
      return {
        ...ecfWalletState,
        isUnlocked: true,
        isInitialized: true,
        selectedAddress: action.value,
      };

    case SET_ACCOUNT_LABEL: {
      const { account } = action.value;
      const name = action.value.label;
      const id = {};
      id[account] = { ...ecfWalletState.identities[account], name };
      const identities = { ...ecfWalletState.identities, ...id };
      return Object.assign(ecfWalletState, { identities });
    }

    case UPDATE_TOKENS:
      return {
        ...ecfWalletState,
        tokens: action.newTokens,
      };

    // ecfWallet.send
    case UPDATE_GAS_LIMIT:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          gasLimit: action.value,
        },
      };
    case UPDATE_GAS_PRICE:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          gasPrice: action.value,
        },
      };

    case TOGGLE_ACCOUNT_MENU:
      return {
        ...ecfWalletState,
        isAccountMenuOpen: !ecfWalletState.isAccountMenuOpen,
      };

    case UPDATE_GAS_TOTAL:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          gasTotal: action.value,
        },
      };

    case UPDATE_SEND_TOKEN_BALANCE:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          tokenBalance: action.value,
        },
      };

    case UPDATE_SEND_HEX_DATA:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          data: action.value,
        },
      };

    case UPDATE_SEND_TO:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          to: action.value.to,
          toNickname: action.value.nickname,
        },
      };

    case UPDATE_SEND_AMOUNT:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          amount: action.value,
        },
      };

    case UPDATE_MAX_MODE:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          maxModeOn: action.value,
        },
      };

    case UPDATE_SEND:
      return Object.assign(ecfWalletState, {
        send: {
          ...ecfWalletState.send,
          ...action.value,
        },
      });

    case UPDATE_SEND_TOKEN: {
      const newSend = {
        ...ecfWalletState.send,
        token: action.value,
      };
      // erase token-related state when switching back to native currency
      if (newSend.editingTransactionId && !newSend.token) {
        const unapprovedTx =
          newSend?.unapprovedTxs?.[newSend.editingTransactionId] || {};
        const txParams = unapprovedTx.txParams || {};
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
        });
      }
      return Object.assign(ecfWalletState, {
        send: newSend,
      });
    }

    case UPDATE_SEND_ENS_RESOLUTION:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          ensResolution: action.payload,
          ensResolutionError: '',
        },
      };

    case UPDATE_SEND_ENS_RESOLUTION_ERROR:
      return {
        ...ecfWalletState,
        send: {
          ...ecfWalletState.send,
          ensResolution: null,
          ensResolutionError: action.payload,
        },
      };

    case CLEAR_SEND:
      return {
        ...ecfWalletState,
        send: {
          gasLimit: null,
          gasPrice: null,
          gasPriceIsCustom: false,
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
      };

    case UPDATE_TRANSACTION_PARAMS: {
      const { id: txId, value } = action;
      let { currentNetworkTxList } = ecfWalletState;
      currentNetworkTxList = currentNetworkTxList.map((tx) => {
        if (tx.id === txId) {
          const newTx = { ...tx };
          newTx.txParams = value;
          return newTx;
        }
        return tx;
      });

      return {
        ...ecfWalletState,
        currentNetworkTxList,
      };
    }

    case UPDATE_FEATURE_FLAGS:
      return {
        ...ecfWalletState,
        featureFlags: action.value,
      };

    case SET_CURRENT_LOCALE:
      return {
        ...ecfWalletState,
        currentLocale: action.value.locale,
      };

    case SET_PENDING_TOKENS:
      return {
        ...ecfWalletState,
        pendingTokens: { ...action.payload },
      };

    case CLEAR_PENDING_TOKENS: {
      return {
        ...ecfWalletState,
        pendingTokens: {},
      };
    }

    case UPDATE_PREFERENCES: {
      return {
        ...ecfWalletState,
        preferences: {
          ...ecfWalletState.preferences,
          ...action.value,
        },
      };
    }

    case COMPLETE_ONBOARDING: {
      return {
        ...ecfWalletState,
        completedOnboarding: true,
      };
    }

    case SET_FIRST_TIME_FLOW_TYPE: {
      return {
        ...ecfWalletState,
        firstTimeFlowType: action.value,
      };
    }

    default:
      return ecfWalletState;
  }
}

export const getCurrentLocale = (state) => state.ecfWallet.currentLocale;

export const getAlertEnabledness = (state) => state.ecfWallet.alertEnabledness;

export const getUnconnectedAccountAlertEnabledness = (state) =>
  getAlertEnabledness(state)[ALERT_TYPES.unconnectedAccount];

export const getUnconnectedAccountAlertShown = (state) =>
  state.ecfWallet.unconnectedAccountAlertShownOrigins;

export const getTokens = (state) => state.ecfWallet.tokens;
