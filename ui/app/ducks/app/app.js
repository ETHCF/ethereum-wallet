import {
  ALERT_CLOSE,
  ALERT_OPEN,
  CLEAR_ACCOUNT_DETAILS,
  COMPLETED_TX,
  DISPLAY_WARNING,
  FORGOT_PASSWORD,
  GAS_LOADING_FINISHED,
  GAS_LOADING_STARTED,
  GO_HOME,
  HIDE_LOADING,
  HIDE_WARNING,
  LOCK_ECF_WALLET,
  MODAL_CLOSE,
  MODAL_OPEN,
  NETWORK_DROPDOWN_CLOSE,
  NETWORK_DROPDOWN_OPEN,
  SET_HARDWARE_WALLET_DEFAULT_HD_PATH,
  SET_MOUSE_USER_STATE,
  SET_NETWORKS_TAB_ADD_MODE,
  SET_OPEN_ECF_WALLET_TAB_IDS,
  SET_PREVIOUS_PROVIDER,
  SET_SELECTED_SETTINGS_RPC_URL,
  SHOW_ACCOUNTS_PAGE,
  SHOW_ACCOUNT_DETAIL,
  SHOW_CONF_TX_PAGE,
  SHOW_LOADING,
  SHOW_SEND_TOKEN_PAGE,
  SIDEBAR_CLOSE,
  SIDEBAR_OPEN,
  UNLOCK_FAILED,
  UNLOCK_SUCCEEDED,
} from '../../store/actionConstants';

export default function reduceApp(state = {}, action) {
  // default state
  const appState = {
    modal: {
      open: false,
      modalState: {
        name: null,
        props: {},
      },
      previousModalState: {
        name: null,
      },
    },
    sidebar: {
      isOpen: false,
      transitionName: '',
      type: '',
      props: {},
    },
    alertOpen: false,
    alertMessage: null,
    networkDropdownOpen: false,
    accountDetail: {},
    // Used to display loading indicator
    isLoading: false,
    // Used to display error text
    warning: null,
    isMouseUser: false,
    gasIsLoading: false,
    defaultHdPaths: {
      trezor: `m/44'/60'/0'/0`,
      ledger: `m/44'/60'/0'/0/0`,
    },
    lastSelectedProvider: null,
    networksTabSelectedRpcUrl: '',
    networksTabIsInAddMode: false,
    openEcfWalletTabs: {},
    ...state,
  };

  switch (action.type) {
    // dropdown methods
    case NETWORK_DROPDOWN_OPEN:
      return {
        ...appState,
        networkDropdownOpen: true,
      };

    case NETWORK_DROPDOWN_CLOSE:
      return {
        ...appState,
        networkDropdownOpen: false,
      };

    // sidebar methods
    case SIDEBAR_OPEN:
      return {
        ...appState,
        sidebar: {
          ...action.value,
          isOpen: true,
        },
      };

    case SIDEBAR_CLOSE:
      return {
        ...appState,
        sidebar: {
          ...appState.sidebar,
          isOpen: false,
        },
      };

    // alert methods
    case ALERT_OPEN:
      return {
        ...appState,
        alertOpen: true,
        alertMessage: action.value,
      };

    case ALERT_CLOSE:
      return {
        ...appState,
        alertOpen: false,
        alertMessage: null,
      };

    // modal methods:
    case MODAL_OPEN: {
      const { name, ...modalProps } = action.payload;

      return {
        ...appState,
        modal: {
          open: true,
          modalState: {
            name,
            props: { ...modalProps },
          },
          previousModalState: { ...appState.modal.modalState },
        },
      };
    }

    case MODAL_CLOSE:
      return {
        ...appState,
        modal: Object.assign(
          appState.modal,
          { open: false },
          { modalState: { name: null, props: {} } },
          { previousModalState: appState.modal.modalState },
        ),
      };

    case CLEAR_ACCOUNT_DETAILS:
      return {
        ...appState,
        accountDetail: {},
      };

    case FORGOT_PASSWORD:
      return {
        ...appState,
        forgottenPassword: action.value,
      };

    case SHOW_SEND_TOKEN_PAGE:
      return {
        ...appState,
        warning: null,
      };

    case LOCK_ECF_WALLET:
      // Nothing shown while unlocked stays up once locked, such as an
      // exported private key.
      return {
        ...appState,
        modal: {
          ...appState.modal,
          open: false,
          modalState: { name: null, props: {} },
          previousModalState: { name: null },
        },
        accountDetail: {},
        warning: null,
      };

    // accounts

    case GO_HOME:
      return {
        ...appState,
        accountDetail: {},
        warning: null,
      };

    case SHOW_ACCOUNT_DETAIL:
      return {
        ...appState,
        forgottenPassword: appState.forgottenPassword
          ? !appState.forgottenPassword
          : null,
        accountDetail: {},
      };

    case SHOW_ACCOUNTS_PAGE:
      return {
        ...appState,
        isLoading: false,
        warning: null,
        forgottenPassword: false,
      };

    case SHOW_CONF_TX_PAGE:
      return {
        ...appState,
        txId: action.id,
        warning: null,
        isLoading: false,
      };

    case COMPLETED_TX:
      if (action.value.unconfirmedActionsCount > 0) {
        return {
          ...appState,
          txId: null,
          warning: null,
        };
      }
      return {
        ...appState,
        warning: null,
        txId: null,
        accountDetail: {},
      };

    case UNLOCK_FAILED:
      return {
        ...appState,
        warning: action.value || 'Incorrect password. Try again.',
      };

    case UNLOCK_SUCCEEDED:
      return {
        ...appState,
        warning: '',
      };

    case SET_HARDWARE_WALLET_DEFAULT_HD_PATH: {
      const { device, path } = action.value;
      const newDefaults = { ...appState.defaultHdPaths };
      newDefaults[device] = path;

      return {
        ...appState,
        defaultHdPaths: newDefaults,
      };
    }

    case SHOW_LOADING:
      return {
        ...appState,
        isLoading: true,
        loadingMessage: action.value,
      };

    case HIDE_LOADING:
      return {
        ...appState,
        isLoading: false,
      };

    case DISPLAY_WARNING:
      return {
        ...appState,
        warning: action.value,
        isLoading: false,
      };

    case HIDE_WARNING:
      return {
        ...appState,
        warning: undefined,
      };

    case SET_MOUSE_USER_STATE:
      return {
        ...appState,
        isMouseUser: action.value,
      };

    case GAS_LOADING_STARTED:
      return {
        ...appState,
        gasIsLoading: true,
      };

    case GAS_LOADING_FINISHED:
      return {
        ...appState,
        gasIsLoading: false,
      };

    case SET_PREVIOUS_PROVIDER:
      if (action.value === 'loading') {
        return appState;
      }
      return {
        ...appState,
        lastSelectedProvider: action.value,
      };

    case SET_SELECTED_SETTINGS_RPC_URL:
      return {
        ...appState,
        networksTabSelectedRpcUrl: action.value,
      };

    case SET_NETWORKS_TAB_ADD_MODE:
      return {
        ...appState,
        networksTabIsInAddMode: action.value,
      };

    case SET_OPEN_ECF_WALLET_TAB_IDS:
      return {
        ...appState,
        openEcfWalletTabs: action.value,
      };

    default:
      return appState;
  }
}
