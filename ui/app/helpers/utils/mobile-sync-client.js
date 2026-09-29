import PubNub from 'pubnub'

export default function createMobileSyncClient (options) {
  const client = new PubNub({ ...options, uuid: global.crypto.randomUUID() })
  // PubNub 4.27.6 has no telemetry opt-out. Its endpoints share this manager;
  // disable both measurement and transmission before issuing any requests.
  const manager = client._telemetryManager
  const methods = ['startLatencyMeasure', 'stopLatencyMeasure', 'operationsLatencyForRequest']
  if (!manager || methods.some((method) => typeof manager[method] !== 'function')) {
    throw new Error('Unsupported mobile-sync transport: cannot disable telemetry')
  }
  manager.startLatencyMeasure = () => undefined
  manager.stopLatencyMeasure = () => undefined
  manager.operationsLatencyForRequest = () => ({})
  return client
}
