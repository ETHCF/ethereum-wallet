import { combineReducers } from 'redux';

import { unconnectedAccount } from './alerts';
import appStateReducer from './app/app';
import confirmTransactionReducer from './confirm-transaction/confirm-transaction.duck';
import ecfWalletReducer from './ecf-wallet/ecf-wallet';
import gasReducer from './gas/gas.duck';
import historyReducer from './history/history';
import localeMessagesReducer from './locale/locale';
import sendReducer from './send/send.duck';
import { ALERT_TYPES } from '../../../app/scripts/controllers/alert';

export default combineReducers({
  [ALERT_TYPES.unconnectedAccount]: unconnectedAccount,
  activeTab: (s) => (s === undefined ? null : s),
  ecfWallet: ecfWalletReducer,
  appState: appStateReducer,
  history: historyReducer,
  send: sendReducer,
  confirmTransaction: confirmTransactionReducer,
  gas: gasReducer,
  localeMessages: localeMessagesReducer,
});
