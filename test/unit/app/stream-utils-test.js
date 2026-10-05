import assert from 'assert';
import pump from 'pump';
import { PassThrough } from 'readable-stream';

import { isPrematureClose } from '../../../app/scripts/lib/stream-utils';

describe('stream utils', function () {
  describe('isPrematureClose', function () {
    it('recognizes a pipeline whose stream was closed by the other end', async function () {
      const error = await new Promise((resolve) => {
        const source = new PassThrough();
        pump(source, new PassThrough(), resolve);
        // As when a popup closes: its port is destroyed without ending.
        source.destroy();
      });
      assert.ok(error, 'the pipeline reports an error');
      assert.equal(isPrematureClose(error), true);
    });

    it('does not hide other errors', function () {
      assert.equal(isPrematureClose(new Error('Invalid JSON')), false);
      assert.equal(isPrematureClose(undefined), false);
    });
  });
});
