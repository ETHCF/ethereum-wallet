import { strict as assert } from 'assert'
import migration from '../../../app/scripts/migrations/048'

describe('migration #48', function () {
  it('removes legacy telemetry data without changing wallet data or the original state', async function () {
    const original = {
      meta: { version: 47 },
      data: {
        PreferencesController: {
          metaMetricsId: 'old-tracking-id',
          metaMetricsSendCount: 12,
          participateInMetaMetrics: true,
          identities: { '0x123': { name: 'Account 1' } },
          currentLocale: 'en',
        },
        KeyringController: { vault: 'encrypted-vault' },
      },
    }
    const migrated = await migration.migrate(original)
    assert.deepEqual(migrated, {
      meta: { version: 48 },
      data: {
        PreferencesController: {
          identities: { '0x123': { name: 'Account 1' } },
          currentLocale: 'en',
        },
        KeyringController: { vault: 'encrypted-vault' },
      },
    })
    assert.equal(original.data.PreferencesController.metaMetricsId, 'old-tracking-id')
    assert.equal(original.meta.version, 47)
  })

  it('handles installations without telemetry preferences', async function () {
    const migrated = await migration.migrate({ meta: { version: 47 }, data: {} })
    assert.deepEqual(migrated, { meta: { version: 48 }, data: {} })
  })
})
