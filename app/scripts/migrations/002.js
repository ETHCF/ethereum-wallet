// next version number
/*

Moves site permissions from rpc-cap's PermissionsController state to the
PermissionController (@metamask/permission-controller) format. Only
eth_accounts existed. The primaryAccountOnly caveat is dropped: sites still
see only the primary permitted account, which the permission's caveat now
enforces itself.

*/

import { cloneDeep } from 'lodash'
import { nanoid } from 'nanoid'

const version = 2

const ADDRESS = /^0x[0-9a-f]{40}$/iu

export default {
  version,

  async migrate (originalVersionedData) {
    const versionedData = cloneDeep(originalVersionedData)
    versionedData.meta.version = version
    const state = versionedData.data
    const newState = transformState(state)
    versionedData.data = newState
    return versionedData
  },
}

function transformState (state) {
  const old = state.PermissionsController
  if (!old || typeof old !== 'object') {
    return state
  }
  const identities = state.PreferencesController?.identities
  const knownAccount = (account) => typeof account === 'string' && ADDRESS.test(account) &&
    (!identities || typeof identities !== 'object' || Object.prototype.hasOwnProperty.call(identities, account))

  const subjects = {}
  for (const [origin, domain] of Object.entries(old.domains || {})) {
    const permission = origin && Array.isArray(domain?.permissions) &&
      domain.permissions.find((item) => item?.parentCapability === 'eth_accounts')
    const caveat = permission && Array.isArray(permission.caveats) &&
      permission.caveats.find((item) => item?.name === 'exposedAccounts' && Array.isArray(item.value))
    const accounts = caveat ? Array.from(new Set(caveat.value.filter(knownAccount))) : []
    if (accounts.length === 0) {
      continue
    }
    subjects[origin] = {
      origin,
      permissions: {
        eth_accounts: {
          id: typeof permission.id === 'string' && permission.id ? permission.id : nanoid(),
          parentCapability: 'eth_accounts',
          invoker: origin,
          date: typeof permission.date === 'number' ? permission.date : Date.now(),
          caveats: [{ type: 'restrictReturnedAccounts', value: accounts }],
        },
      },
    }
  }

  // Pending requests and descriptions were never meant to outlive a session.
  delete state.PermissionsController
  state.PermissionController = { subjects }
  return state
}
