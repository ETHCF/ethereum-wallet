import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import { Duplex } from 'readable-stream';
import sinon from 'sinon';

import { flush, loadAnnounceProvider, openPage } from '../../lib/page-globals';

const announceProvider = loadAnnounceProvider();

// Stands in for the window.postMessage transport to the content script.
class FakePageStream extends Duplex {
  static instances = [];

  constructor(options) {
    super({ objectMode: true });
    this.options = options;
    this.written = [];
    FakePageStream.instances.push(this);
  }

  _read() {
    // Messages are pushed by the test.
  }

  _write(chunk, _encoding, callback) {
    this.written.push(chunk);
    callback();
  }
}

function fakeLog() {
  return {
    setDefaultLevel: sinon.spy(),
    warn: sinon.spy(),
    debug: sinon.spy(),
    error: sinon.spy(),
    info: sinon.spy(),
    log: sinon.spy(),
    trace: sinon.spy(),
  };
}

function loadInpage({ inject = true } = {}) {
  const log = fakeLog();
  proxyquire('../../../app/scripts/inpage', {
    '@metamask/post-message-stream': {
      WindowPostMessageStream: FakePageStream,
    },
    './lib/should-inject-provider': {
      __esModule: true,
      default: () => inject,
      '@noCallThru': true,
    },
    './lib/announce-provider': {
      __esModule: true,
      default: announceProvider,
      '@noCallThru': true,
    },
    loglevel: { __esModule: true, default: log, '@noCallThru': true },
  });
  return log;
}

describe('inpage script', function () {
  let restore;
  let announcements;

  beforeEach(function () {
    FakePageStream.instances = [];
    restore = openPage(
      '<!doctype html><html><head></head><body></body></html>',
    );
    announcements = [];
    window.addEventListener('eip6963:announceProvider', (event) =>
      announcements.push(event.detail),
    );
  });

  afterEach(async function () {
    // Let the provider's startup requests settle on this page.
    await flush();
    restore();
  });

  it('does nothing on a page that does not get the provider', function () {
    loadInpage({ inject: false });
    assert.equal(window.ethereum, undefined);
    assert.equal(FakePageStream.instances.length, 0);
    assert.equal(announcements.length, 0);
  });

  it('talks only to the content script', function () {
    loadInpage();
    assert.deepEqual(FakePageStream.instances[0].options, {
      name: 'ecf-wallet-inpage',
      target: 'ecf-wallet-contentscript',
    });
  });

  it('sets window.ethereum and announces the same provider', function () {
    const initialized = sinon.spy();
    window.addEventListener('ethereum#initialized', initialized);
    loadInpage();
    assert.equal(window.ethereum.isECFWallet, true);
    assert.equal(window.ethereum.isMetaMask, true);
    assert.equal(initialized.calledOnce, true);
    assert.equal(announcements.length, 1);
    assert.equal(announcements[0].provider, window.ethereum);
  });

  it('keeps provider properties a page tries to delete', function () {
    loadInpage();
    delete window.ethereum.isECFWallet;
    delete window.ethereum.request;
    assert.equal(window.ethereum.isECFWallet, true);
    assert.equal(typeof window.ethereum.request, 'function');
  });

  it('exposes the experimental namespace under both names, warning once', function () {
    const log = loadInpage();
    const { ethereum } = window;
    assert.equal(ethereum._ecfwallet, ethereum._metamask);
    assert.equal(typeof ethereum._ecfwallet.isUnlocked, 'function');
    assert.equal(typeof ethereum._metamask.isUnlocked, 'function');
    const warnings = log.warn.args.filter(([message]) =>
      String(message).includes('_ecfwallet'),
    );
    assert.equal(warnings.length, 1);
  });

  it("leaves another wallet's window.ethereum in place but still announces", function () {
    const other = { isOtherWallet: true };
    window.ethereum = other;
    loadInpage();
    assert.equal(window.ethereum, other);
    assert.equal(announcements.length, 1);
    assert.equal(announcements[0].provider.isECFWallet, true);
  });

  it('respects a window.ethereum claimed read-only or by a getter', function () {
    Object.defineProperty(window, 'ethereum', {
      value: undefined,
      writable: false,
      configurable: true,
    });
    loadInpage();
    assert.equal(window.ethereum, undefined);
    assert.equal(announcements.length, 1);

    delete window.ethereum;
    Object.defineProperty(window, 'ethereum', {
      get: () => undefined,
      configurable: true,
    });
    loadInpage();
    assert.equal(window.ethereum, undefined);
    assert.equal(announcements.length, 2);
  });

  it('sets window.ethereum through an unused setter', function () {
    let stored;
    Object.defineProperty(window, 'ethereum', {
      get: () => stored,
      set: (value) => {
        stored = value;
      },
      configurable: true,
    });
    loadInpage();
    assert.equal(stored?.isECFWallet, true);
  });
});
