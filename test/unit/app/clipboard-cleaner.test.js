import { strict as assert } from 'assert';

import ClipboardCleaner, {
  CLIPBOARD_CLEAR_ALARM,
} from '../../../app/scripts/lib/clipboard-cleaner';

function fakeAlarms() {
  const alarms = new Map();
  return {
    alarms,
    create: (name, info) => alarms.set(name, info),
    clear: (name) => alarms.delete(name),
  };
}

function fakeDocument({ copies = true } = {}) {
  const listeners = new Set();
  const doc = {
    clipboard: 'secret words',
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    execCommand: (command) => {
      assert.equal(command, 'copy');
      if (!copies) {
        return false;
      }
      for (const listener of listeners) {
        listener({
          clipboardData: {
            setData: (_type, value) => {
              doc.clipboard = value;
            },
          },
          preventDefault: () => undefined,
        });
      }
      return true;
    },
  };
  return doc;
}

describe('ClipboardCleaner', function () {
  it('clears from the background page where there are no offscreen documents', async function () {
    const alarms = fakeAlarms();
    const doc = fakeDocument();
    const cleaner = new ClipboardCleaner({
      extension: { alarms },
      document: doc,
      now: () => 1000,
    });

    assert.equal(cleaner.schedule(), true);
    assert.equal(alarms.alarms.get(CLIPBOARD_CLEAR_ALARM).when, 61000);
    assert.equal(
      await cleaner.handleAlarm({ name: CLIPBOARD_CLEAR_ALARM }),
      true,
    );
    assert.equal(doc.clipboard, '');
    assert.equal(alarms.alarms.has(CLIPBOARD_CLEAR_ALARM), false);
  });

  it('reports a copy the browser refused', async function () {
    const cleaner = new ClipboardCleaner({
      extension: { alarms: fakeAlarms() },
      document: fakeDocument({ copies: false }),
    });
    assert.equal(await cleaner.clear(), false);
  });

  it('does not promise a clear it has no way to do', async function () {
    const alarms = fakeAlarms();
    const cleaner = new ClipboardCleaner({
      extension: { alarms },
      document: null,
    });
    assert.equal(cleaner.schedule(), false);
    assert.equal(alarms.alarms.size, 0);
    assert.equal(await cleaner.clear(), false);
  });
});
