import { createStore, applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import { composeWithDevTools } from 'remote-redux-devtools'
import rootReducer from '../ducks'

export default function configureStore (initialState) {
  const composeEnhancers = composeWithDevTools({
    name: 'ecf-wallet',
    hostname: 'localhost',
    port: 8000,
    realtime: Boolean(process.env.ECF_WALLET_DEBUG),
  })
  return createStore(rootReducer, initialState, composeEnhancers(
    applyMiddleware(
      thunkMiddleware,
    ),
  ))
}
