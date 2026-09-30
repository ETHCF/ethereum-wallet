/*

This migration ensures previous installations
get a `firstTimeInfo` key on the ecfWallet state,
so that we can version notices in the future.

*/

import { cloneDeep } from 'lodash'

const version = 20

export default {
  version,

  migrate (originalVersionedData) {
    const versionedData = cloneDeep(originalVersionedData)
    versionedData.meta.version = version
    try {
      const state = versionedData.data
      const newState = transformState(state)
      versionedData.data = newState
    } catch (err) {
      console.warn(`ecf-wallet Migration #${version}${err.stack}`)
    }
    return Promise.resolve(versionedData)
  },
}

function transformState (state) {
  const newState = state
  if ('ecfWallet' in newState &&
      !('firstTimeInfo' in newState.ecfWallet)) {
    newState.ecfWallet.firstTimeInfo = {
      version: '3.12.0',
      date: Date.now(),
    }
  }
  return newState
}

