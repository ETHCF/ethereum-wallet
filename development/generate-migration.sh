#! /bin/bash
set -euo pipefail

version=${1:-}
if [[ ! "$version" =~ ^[1-9][0-9]*$ ]]; then
  echo "Migration version must be a positive integer (starting at 1)." >&2
  exit 1
fi

printf -v vnum '%03d' "$version"
migration_file="app/scripts/migrations/$vnum.js"
test_file="test/unit/migrations/$vnum-test.js"
if [[ -e "$migration_file" || -e "$test_file" ]]; then
  echo "Migration $version or its test already exists." >&2
  exit 1
fi

sed "s/const version = 0/const version = $version/" app/scripts/migrations/template.js > "$migration_file"
cat > "$test_file" <<EOF
import { strict as assert } from 'assert';

import migration$version from '../../../app/scripts/migrations/$vnum';

describe('migration #$version', function () {
  it('updates the version metadata', async function () {
    const { meta } = await migration$version.migrate({
      meta: { version: $((version - 1)) },
      data: {},
    });
    assert.equal(meta.version, $version);
  });
});
EOF

echo "Created $migration_file and $test_file. Register the migration in app/scripts/migrations/index.js."
