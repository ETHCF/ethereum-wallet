import assert from 'assert';

import { freeze } from '../../app/scripts/lib/freezeGlobals';

// test/env.js stops freezeGlobals from freezing Promise on import, so that
// other suites can stub it. This suite runs in its own process: freeze it
// here as the extension does.
freeze(global, 'Promise');

// Babel compiles this module as strict code, where writing to a read-only
// property or deleting a non-configurable one throws a TypeError.
describe('Promise global is immutable', function () {
  const original = Promise;

  afterEach(function () {
    // Each test must have changed nothing.
    assert.equal(global.Promise, original);
    assert.equal(typeof Promise.all, 'function');
    assert.equal(Promise.foo, undefined);
  });

  it('throws when reassinging promise (syntax 1)', function () {
    assert.throws(() => {
      // eslint-disable-next-line no-global-assign,no-native-reassign
      Promise = {};
    }, TypeError);
  });

  it('throws when reassinging promise (syntax 2)', function () {
    assert.throws(() => {
      global.Promise = {};
    }, TypeError);
  });

  it('throws when mutating existing Promise property', function () {
    assert.throws(() => {
      Promise.all = () => undefined;
    }, TypeError);
  });

  it('throws when adding new Promise property', function () {
    assert.throws(() => {
      Promise.foo = 'bar';
    }, TypeError);
  });

  it('throws when deleting Promise from global', function () {
    assert.throws(() => {
      delete global.Promise;
    }, TypeError);
  });
});
