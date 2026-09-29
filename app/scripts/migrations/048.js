import { cloneDeep } from 'lodash'

const version = 48

/**
 * Remove identifiers and preferences belonging to the retired telemetry system.
 */
export default {
  version,
  async migrate (originalVersionedData) {
    const versionedData = cloneDeep(originalVersionedData)
    versionedData.meta.version = version
    const preferences = versionedData.data?.PreferencesController
    if (preferences) {
      delete preferences.metaMetricsId
      delete preferences.metaMetricsSendCount
      delete preferences.participateInMetaMetrics
    }
    return versionedData
  },
}
