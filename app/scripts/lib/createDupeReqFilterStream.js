import { Transform } from 'readable-stream'
import log from 'loglevel'

// How long a request ID is remembered on one connection.
export const SEEN_ID_LIFETIME_MS = 60 * 1000

/**
 * Drops requests that repeat the ID of a recent request on the same
 * connection, so a replayed message cannot trigger a second prompt or answer.
 * Notifications, which have no ID, pass through.
 *
 * @param {Object} [options]
 * @param {Function} [options.now] - Returns the current time in milliseconds.
 */
export default function createDupeReqFilterStream ({ now = Date.now } = {}) {
  const seen = new Map()
  return new Transform({
    objectMode: true,
    transform (request, _, callback) {
      const id = request?.id
      if (id === undefined || id === null) {
        callback(null, request)
        return
      }
      const time = now()
      for (const [seenId, seenAt] of seen) {
        if (seenAt > time - SEEN_ID_LIFETIME_MS) {
          break
        }
        seen.delete(seenId)
      }
      if (seen.has(id)) {
        log.warn(`Dropped a repeated request with ID ${JSON.stringify(id)} for ${request.method}`)
        callback()
        return
      }
      seen.set(id, time)
      callback(null, request)
    },
  })
}
