import { configureStore as createReduxStore } from '@reduxjs/toolkit'
import rootReducer from '../ducks'

export default function configureStore (initialState) {
  return createReduxStore({
    reducer: rootReducer,
    preloadedState: initialState,
    // Keep the plain thunk setup the store had before Redux Toolkit; the
    // development-only state checks are not wired up for this app.
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }),
    devTools: false,
  })
}
