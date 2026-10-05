import { strict as assert } from 'assert';

import {
  snapshotFromTxMeta,
  replayHistory,
  generateHistoryEntry,
} from '../../../../../app/scripts/controllers/transactions/lib/tx-state-history-helpers';

describe('Transaction state history helper', function () {
  describe('#snapshotFromTxMeta', function () {
    it('should clone deep', function () {
      const input = {
        foo: {
          bar: {
            bam: 'baz',
          },
        },
      };
      const output = snapshotFromTxMeta(input);
      assert.ok(Reflect.has(output, 'foo'), 'has a foo key');
      assert.ok(Reflect.has(output.foo, 'bar'), 'has a bar key');
      assert.ok(Reflect.has(output.foo.bar, 'bam'), 'has a bar key');
      assert.equal(output.foo.bar.bam, 'baz', 'has a baz value');
    });

    it('should remove the history key', function () {
      const input = { foo: 'bar', history: 'remembered' };
      const output = snapshotFromTxMeta(input);
      assert.equal(typeof output.history, 'undefined', 'should remove history');
    });
  });

  describe('#replayHistory', function () {
    it('replaying history does not mutate the original object', function () {
      const initialState = { test: true, message: 'hello', value: 1 };
      const diff1 = [
        {
          op: 'replace',
          path: '/message',
          value: 'haay',
        },
      ];
      const diff2 = [
        {
          op: 'replace',
          path: '/value',
          value: 2,
        },
      ];
      const history = [initialState, diff1, diff2];

      const beforeStateSnapshot = JSON.stringify(initialState);
      const latestState = replayHistory(history);
      const afterStateSnapshot = JSON.stringify(initialState);
      assert.notEqual(
        initialState,
        latestState,
        'initial state is not the same obj as the latest state',
      );
      assert.equal(
        beforeStateSnapshot,
        afterStateSnapshot,
        'initial state is not modified during run',
      );
    });
  });

  describe('#generateHistoryEntry', function () {
    function generateHistoryEntryTest(note) {
      const prevState = {
        someValue: 'value 1',
        foo: {
          bar: {
            bam: 'baz',
          },
        },
      };

      const nextState = {
        newPropRoot: 'new property - root',
        someValue: 'value 2',
        foo: {
          newPropFirstLevel: 'new property - first level',
          bar: {
            bam: 'baz',
          },
        },
      };

      const before = new Date().getTime();
      const result = generateHistoryEntry(prevState, nextState, note);
      const after = new Date().getTime();
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 3);

      const expectedEntry1 = {
        op: 'add',
        path: '/foo/newPropFirstLevel',
        value: 'new property - first level',
      };
      assert.equal(result[0].op, expectedEntry1.op);
      assert.equal(result[0].path, expectedEntry1.path);
      assert.equal(result[0].value, expectedEntry1.value);
      assert.equal(result[0].note, note);
      assert.ok(result[0].timestamp >= before && result[0].timestamp <= after);

      const expectedEntry2 = {
        op: 'replace',
        path: '/someValue',
        value: 'value 2',
      };
      assert.deepEqual(result[1], expectedEntry2);

      const expectedEntry3 = {
        op: 'add',
        path: '/newPropRoot',
        value: 'new property - root',
      };
      assert.deepEqual(result[2], expectedEntry3);
    }

    it('should generate history entries', function () {
      generateHistoryEntryTest();
    });

    it('should add note to first entry', function () {
      generateHistoryEntryTest('custom note');
    });
  });
});
