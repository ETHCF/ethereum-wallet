import { ObservableStore } from '@metamask/obs-store'
import { rpcErrors } from '@metamask/rpc-errors'

/**
 * Provides the ApprovalController actions that PermissionController uses, and
 * keeps pending requests in the shape the wallet's connect page reads
 * (permissionsRequests). Requests are not persisted.
 */
export default class PermissionApprovals {

  /**
   * @param {Object} opts
   * @param {Function} opts.showPermissionRequest - Opens the connect page.
   */
  constructor ({ showPermissionRequest }) {
    this.store = new ObservableStore({ permissionsRequests: [] })
    this._pending = new Map()
    this._showPermissionRequest = showPermissionRequest
  }

  addRequest ({ id, origin, requestData, type }, shouldShowRequest) {
    if (type !== 'wallet_requestPermissions') {
      throw rpcErrors.internal(`Unsupported approval type: ${type}`)
    }
    // One request per site at a time, so a site cannot queue up prompts.
    if (Array.from(this._pending.values()).some((pending) => pending.origin === origin)) {
      throw rpcErrors.resourceUnavailable('Permissions request already pending; please wait.')
    }
    if (this._pending.has(id)) {
      throw rpcErrors.internal(`Permissions request with id '${id}' already exists.`)
    }
    return new Promise((resolve, reject) => {
      this._pending.set(id, { origin, request: { metadata: requestData.metadata, permissions: requestData.permissions }, resolve, reject })
      this._updateStore()
      if (shouldShowRequest) {
        this._showPermissionRequest()
      }
    })
  }

  hasRequest ({ id, origin } = {}) {
    if (id !== undefined) {
      return this._pending.has(id)
    }
    return Array.from(this._pending.values()).some((pending) => pending.origin === origin)
  }

  /**
   * @param {string} id - The request id
   * @returns {Object|undefined} The pending request as shown to the user
   */
  getRequest (id) {
    return this._pending.get(id)?.request
  }

  async acceptRequest (id, value) {
    this._take(id).resolve(value)
    return { value }
  }

  rejectRequest (id, error) {
    this._take(id).reject(error)
  }

  _take (id) {
    const pending = this._pending.get(id)
    if (!pending) {
      throw rpcErrors.internal(`Permissions request with id '${id}' not found.`)
    }
    this._pending.delete(id)
    this._updateStore()
    return pending
  }

  _updateStore () {
    this.store.updateState({ permissionsRequests: Array.from(this._pending.values(), ({ request }) => request) })
  }
}
