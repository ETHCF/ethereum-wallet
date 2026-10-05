import assert from 'assert';
import fs from 'fs';
import { cloneDeep } from 'lodash';

import data from '../../../app/scripts/first-time-state';
import Migrator from '../../../app/scripts/lib/migrator';
import liveMigrations from '../../../app/scripts/migrations';

const stubMigrations = [
  {
    version: 1,
    migrate: (state) => {
      // clone the data just like we do in migrations
      const clonedData = cloneDeep(state);
      clonedData.meta.version = 1;
      return Promise.resolve(clonedData);
    },
  },
  {
    version: 2,
    migrate: (state) => {
      const clonedData = cloneDeep(state);
      clonedData.meta.version = 2;
      return Promise.resolve(clonedData);
    },
  },
  {
    version: 3,
    migrate: (state) => {
      const clonedData = cloneDeep(state);
      clonedData.meta.version = 3;
      return Promise.resolve(clonedData);
    },
  },
];
const versionedData = { meta: { version: 0 }, data: { hello: 'world' } };

const firstTimeState = {
  meta: { version: 0 },
  data,
};

describe('migrations', function () {
  describe('liveMigrations require list', function () {
    let migrationNumbers;

    before(function () {
      const fileNames = fs.readdirSync('./app/scripts/migrations/');
      migrationNumbers = fileNames
        .reduce((acc, filename) => {
          const name = filename.split('.')[0];
          if (/^\d+$/u.test(name)) {
            acc.push(name);
          }
          return acc;
        }, [])
        .map((num) => parseInt(num, 10));
    });

    it('should include all migrations', function () {
      migrationNumbers.forEach((num) => {
        const migration = liveMigrations.find((m) => m.version === num);
        assert(
          migration,
          `migration not included in 'migrations/index.js': ${num}`,
        );
      });
    });

    it('should have tests for all migrations', function () {
      const fileNames = fs.readdirSync('./test/unit/migrations/');
      const testNumbers = fileNames
        .reduce((acc, filename) => {
          const name = filename.split('-test.')[0];
          if (/^\d+$/u.test(name)) {
            acc.push(name);
          }
          return acc;
        }, [])
        .map((num) => parseInt(num, 10));

      migrationNumbers.forEach((num) => {
        assert.ok(
          testNumbers.includes(num),
          `no test found for migration: ${num}`,
        );
      });
    });
  });

  describe('Migrator', function () {
    it('starts fresh storage at version 0 without changing wallet data', async function () {
      const migrator = new Migrator();
      const state = migrator.generateInitialState(data);
      assert.deepEqual(state, firstTimeState);
      assert.strictEqual(await migrator.migrateData(state), state);
    });

    it('applies future migrations to version 0 storage without replaying completed ones', async function () {
      const versions = [];
      const migrations = [2, 1].map((version) => ({
        version,
        async migrate(state) {
          versions.push(version);
          return { ...state, meta: { version } };
        },
      }));
      const migrator = new Migrator({ migrations, defaultVersion: 0 });
      const state = migrator.generateInitialState(data);
      const migrated = await migrator.migrateData(state);
      assert.deepEqual(versions, [1, 2]);
      assert.equal(migrated.meta.version, 2);
      assert.deepEqual(
        migrations.map(({ version }) => version),
        [2, 1],
      );
      await migrator.migrateData(migrated);
      assert.deepEqual(versions, [1, 2]);
    });

    it('rejects migrations that fail to update the schema version', async function () {
      const migrator = new Migrator({
        migrations: [
          {
            version: 1,
            async migrate(state) {
              return state;
            },
          },
        ],
      });
      await assert.rejects(
        migrator.migrateData(firstTimeState),
        /did not update version number/u,
      );
    });

    it('migratedData version should be version 3', async function () {
      const migrator = new Migrator({ migrations: stubMigrations });
      const migratedData = await migrator.migrateData(versionedData);
      assert.equal(migratedData.meta.version, stubMigrations[2].version);
    });

    it('should match the last version in live migrations', async function () {
      const migrator = new Migrator({ migrations: liveMigrations });
      const migratedData = await migrator.migrateData(firstTimeState);
      const latestVersion = liveMigrations.slice(-1)[0]?.version ?? 0;
      assert.equal(migratedData.meta.version, latestVersion);
    });

    it('should emit an error', async function () {
      const migrator = new Migrator({
        migrations: [
          {
            version: 1,
            async migrate() {
              throw new Error('test');
            },
          },
        ],
      });
      await assert.rejects(migrator.migrateData({ meta: { version: 0 } }));
    });
  });
});
