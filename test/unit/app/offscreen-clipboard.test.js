import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { CLEAR_CLIPBOARD_MESSAGE } from '../../../app/scripts/lib/clear-clipboard';

const EXTENSION_ID = 'ecf-wallet-id';

describe('offscreen clipboard document', function () {
  let listener;
  let clearClipboardInDocument;
  let previousChrome;

  beforeEach(function () {
    previousChrome = global.chrome;
    listener = undefined;
    global.chrome = {
      runtime: {
        id: EXTENSION_ID,
        onMessage: {
          addListener: (added) => {
            listener = added;
          },
        },
      },
    };
    clearClipboardInDocument = sinon.stub().returns(true);
    proxyquire('../../../app/scripts/offscreen-clipboard', {
      './lib/clear-clipboard': {
        CLEAR_CLIPBOARD_MESSAGE,
        clearClipboardInDocument,
      },
    });
  });

  afterEach(function () {
    global.chrome = previousChrome;
  });

  it('clears the clipboard when the extension asks', function () {
    const respond = sinon.spy();
    listener(
      { type: CLEAR_CLIPBOARD_MESSAGE },
      { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/` },
      respond,
    );
    assert.deepEqual(clearClipboardInDocument.args, [[document]]);
    assert.deepEqual(respond.args, [[true]]);
  });

  it('reports a clear the browser refused', function () {
    clearClipboardInDocument.returns(false);
    const respond = sinon.spy();
    listener({ type: CLEAR_CLIPBOARD_MESSAGE }, { id: EXTENSION_ID }, respond);
    assert.deepEqual(respond.args, [[false]]);
  });

  it('ignores messages from other extensions', function () {
    const respond = sinon.spy();
    listener(
      { type: CLEAR_CLIPBOARD_MESSAGE },
      { id: 'other-extension-id' },
      respond,
    );
    listener({ type: CLEAR_CLIPBOARD_MESSAGE }, {}, respond);
    assert.equal(clearClipboardInDocument.called, false);
    assert.equal(respond.called, false);
  });

  it('ignores other messages', function () {
    const respond = sinon.spy();
    for (const message of [undefined, null, 'clear', { type: 'other' }]) {
      assert.equal(listener(message, { id: EXTENSION_ID }, respond), undefined);
    }
    assert.equal(clearClipboardInDocument.called, false);
    assert.equal(respond.called, false);
  });
});
