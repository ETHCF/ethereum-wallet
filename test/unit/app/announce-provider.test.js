import { strict as assert } from 'assert';

import { loadAnnounceProvider, openPage } from '../../lib/page-globals';

const announceProvider = loadAnnounceProvider();

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('announceProvider (EIP-6963)', function () {
  let restore;
  let announcements;

  beforeEach(function () {
    restore = openPage('<!doctype html><html></html>');
    announcements = [];
    window.addEventListener('eip6963:announceProvider', (event) =>
      announcements.push(event.detail),
    );
  });

  afterEach(function () {
    restore();
  });

  it('announces the wallet when the page loads', function () {
    const provider = {};
    announceProvider(provider);
    assert.equal(announcements.length, 1);
    const [{ info, provider: announced }] = announcements;
    assert.equal(announced, provider);
    assert.equal(info.name, 'ECF Wallet');
    assert.equal(info.rdns, 'org.ethcf.wallet');
    assert.match(info.uuid, UUID_V4);
    assert.match(info.icon, /^data:image\/svg\+xml,%3Csvg/u);
    assert.deepEqual(Object.keys(info).sort(), [
      'icon',
      'name',
      'rdns',
      'uuid',
    ]);
  });

  it('answers each request with the same identity and provider', function () {
    const provider = {};
    announceProvider(provider);
    window.dispatchEvent(new window.Event('eip6963:requestProvider'));
    window.dispatchEvent(new window.Event('eip6963:requestProvider'));
    assert.equal(announcements.length, 3);
    for (const detail of announcements) {
      assert.equal(detail, announcements[0]);
      assert.equal(detail.provider, provider);
      assert.equal(detail.info.uuid, announcements[0].info.uuid);
    }
  });

  it('does not let a listener change what later listeners receive', function () {
    const provider = {};
    window.addEventListener('eip6963:announceProvider', (event) => {
      try {
        event.detail.provider = { fake: true };
      } catch {
        // frozen
      }
      try {
        event.detail.info.rdns = 'evil.example';
      } catch {
        // frozen
      }
    });
    announceProvider(provider);
    window.dispatchEvent(new window.Event('eip6963:requestProvider'));
    assert.ok(Object.isFrozen(announcements[0]));
    assert.ok(Object.isFrozen(announcements[0].info));
    assert.equal(announcements[1].provider, provider);
    assert.equal(announcements[1].info.rdns, 'org.ethcf.wallet');
  });

  it('gives each page load a new identifier', function () {
    announceProvider({});
    restore();
    restore = openPage('<!doctype html><html></html>');
    let second;
    window.addEventListener('eip6963:announceProvider', (event) => {
      second = event.detail;
    });
    announceProvider({});
    assert.match(second.info.uuid, UUID_V4);
    assert.notEqual(second.info.uuid, announcements[0].info.uuid);
  });
});
