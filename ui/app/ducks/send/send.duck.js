// Actions
const UPDATE_SEND_ERRORS = 'ecf-wallet/send/UPDATE_SEND_ERRORS'
const RESET_SEND_STATE = 'ecf-wallet/send/RESET_SEND_STATE'
const SHOW_GAS_BUTTON_GROUP = 'ecf-wallet/send/SHOW_GAS_BUTTON_GROUP'
const HIDE_GAS_BUTTON_GROUP = 'ecf-wallet/send/HIDE_GAS_BUTTON_GROUP'

const initState = {
  gasButtonGroupShown: true,
  errors: {},
}

// Reducer
export default function reducer (state = initState, action) {
  switch (action.type) {
    case UPDATE_SEND_ERRORS:
      return {
        ...state,
        errors: {
          ...state.errors,
          ...action.value,
        },
      }
    case SHOW_GAS_BUTTON_GROUP:
      return {
        ...state,
        gasButtonGroupShown: true,
      }
    case HIDE_GAS_BUTTON_GROUP:
      return {
        ...state,
        gasButtonGroupShown: false,
      }
    case RESET_SEND_STATE:
      return { ...initState }
    default:
      return state
  }
}

// Action Creators
export function showGasButtonGroup () {
  return { type: SHOW_GAS_BUTTON_GROUP }
}

export function hideGasButtonGroup () {
  return { type: HIDE_GAS_BUTTON_GROUP }
}

export function updateSendErrors (errorObject) {
  return {
    type: UPDATE_SEND_ERRORS,
    value: errorObject,
  }
}

export function resetSendState () {
  return { type: RESET_SEND_STATE }
}
