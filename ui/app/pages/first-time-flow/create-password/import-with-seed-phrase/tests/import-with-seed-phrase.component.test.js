import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import ImportWithSeedPhrase from '../import-with-seed-phrase.component';

function shallowRender(props = {}, context = {}) {
  return shallow(<ImportWithSeedPhrase {...props} />, {
    context: {
      t: (str) => `${str}_t`,
      ...context,
    },
  });
}

describe('ImportWithSeedPhrase Component', function () {
  it('never spell checks or autocompletes the seed phrase, shown or masked', function () {
    const root = shallowRender({ onSubmit: sinon.spy() });
    const fields = () => [
      ...root.find('textarea'),
      ...root.find('.first-time-flow__seedphrase'),
    ];
    for (const showSeedPhrase of [false, true]) {
      root.setState({ showSeedPhrase });
      assert.equal(fields().length, 1);
      const field = root.find(
        showSeedPhrase ? 'textarea' : '.first-time-flow__seedphrase',
      );
      assert.equal(field.prop('spellCheck'), false);
      assert.equal(field.prop('autoComplete'), 'off');
      assert.equal(field.prop('autoCorrect'), 'off');
      assert.equal(field.prop('autoCapitalize'), 'off');
    }
  });

  describe('parseSeedPhrase', function () {
    it('should handle a regular seed phrase', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase('foo bar baz'), 'foo bar baz');
    });

    it('should handle a mixed-case seed phrase', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase('FOO bAr baZ'), 'foo bar baz');
    });

    it('should handle an upper-case seed phrase', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase('FOO BAR BAZ'), 'foo bar baz');
    });

    it('should trim extraneous whitespace from the given seed phrase', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase('  foo   bar   baz  '), 'foo bar baz');
    });

    it('should return an empty string when given a whitespace-only string', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase('   '), '');
    });

    it('should return an empty string when given a string with only symbols', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase('$'), '');
    });

    it('should return an empty string for both null and undefined', function () {
      const root = shallowRender({
        onSubmit: sinon.spy(),
      });

      const { parseSeedPhrase } = root.instance();

      assert.deepEqual(parseSeedPhrase(undefined), '');
      assert.deepEqual(parseSeedPhrase(null), '');
    });
  });
});
