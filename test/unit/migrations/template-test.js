import assert from 'assert';

import migrationTemplate from '../../../app/scripts/migrations/template';

const storage = {
  meta: {},
  data: {},
};

describe('storage is migrated successfully', function () {
  it('should work', async function () {
    const migratedData = await migrationTemplate.migrate(storage);
    assert.equal(migratedData.meta.version, 0);
  });
});
