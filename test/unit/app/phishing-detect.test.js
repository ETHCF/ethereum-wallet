import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import path from 'path';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { PHISHING_WARNING_CONTINUE } from '../../../app/scripts/lib/phishing-warnings';
import { flush, openPage } from '../../lib/page-globals';

const PAGE = readFileSync(
  path.join(__dirname, '../../../app/phishing.html'),
  'utf8',
);
// What a website could put in the warning page's URL.
const PAGE_URL =
  'chrome-extension://ecf-wallet-id/phishing.html?hostname=bank.example&href=https%3A%2F%2Fattacker.example';

let restore;

function sessionStorage(items) {
  return {
    get: sinon.spy(async (key) =>
      Object.hasOwn(items, key) ? { [key]: items[key] } : {},
    ),
    set: sinon.stub().resolves(),
    remove: sinon.stub().resolves(),
  };
}

async function openWarningPage({ tab = { id: 4 }, items = {} } = {}) {
  // The page and its script load together, before the page fires
  // DOMContentLoaded.
  restore = openPage(PAGE, { url: PAGE_URL });
  const port = {
    onDisconnect: { addListener: sinon.spy() },
    postMessage: sinon.spy(),
  };
  const throwing = () => {
    throw new Error('the warning must be read from session storage');
  };
  const extension = {
    tabs: { getCurrent: sinon.stub().resolves(tab) },
    storage: {
      session: sessionStorage(items),
      local: { get: throwing, set: throwing },
    },
    runtime: { connect: sinon.stub().returns(port) },
  };
  proxyquire('../../../app/scripts/phishing-detect', {
    './lib/extension-api': {
      __esModule: true,
      default: extension,
      '@noCallThru': true,
    },
  });
  await new Promise((resolve) =>
    document.addEventListener('DOMContentLoaded', resolve),
  );
  await flush();
  return { extension, port };
}

const byId = (id) => document.getElementById(id);

describe('phishing warning page', function () {
  afterEach(function () {
    restore?.();
    restore = undefined;
  });

  it('names the site the background flagged for this tab', async function () {
    const { extension } = await openWarningPage({
      items: {
        'phishingWarning:4': {
          hostname: 'phish.example',
          href: 'https://phish.example/login',
        },
      },
    });
    assert.deepEqual(extension.storage.session.get.args, [
      ['phishingWarning:4'],
    ]);
    assert.equal(byId('flagged-site').hidden, false);
    assert.equal(byId('flagged-hostname').textContent, 'phish.example');
    assert.equal(byId('flagged-frame').hidden, true);
  });

  it('names the page a flagged frame was loaded by', async function () {
    await openWarningPage({
      items: {
        'phishingWarning:4': {
          hostname: 'phish.example',
          href: 'https://news.example/article',
        },
      },
    });
    assert.equal(byId('flagged-hostname').textContent, 'phish.example');
    assert.equal(byId('flagged-page-hostname').textContent, 'news.example');
    assert.equal(byId('flagged-frame').hidden, false);
  });

  it('ignores what the page URL says', async function () {
    await openWarningPage({
      items: {
        'phishingWarning:5': {
          hostname: 'other-tab.example',
          href: 'https://other-tab.example/',
        },
      },
    });
    assert.equal(byId('flagged-site').hidden, true);
    assert.equal(byId('flagged-hostname').textContent, '');
    assert.doesNotMatch(document.body.textContent, /bank\.example/u);
    assert.doesNotMatch(document.body.textContent, /attacker\.example/u);
  });

  it('shows the hostname as text', async function () {
    await openWarningPage({
      items: {
        'phishingWarning:4': {
          hostname: '<img src=x onerror=alert(1)>',
          href: 'https://phish.example/',
        },
      },
    });
    assert.equal(document.querySelector('#flagged-site img'), null);
    assert.equal(
      byId('flagged-hostname').textContent,
      '<img src=x onerror=alert(1)>',
    );
  });

  it('shows no site outside a tab', async function () {
    const { extension } = await openWarningPage({ tab: null });
    assert.equal(extension.storage.session.get.called, false);
    assert.equal(byId('flagged-site').hidden, true);
  });

  it('continues by asking the background, sending it nothing', async function () {
    const { extension, port } = await openWarningPage();
    byId('unsafe-continue').click();
    assert.deepEqual(extension.runtime.connect.args, [
      [{ name: PHISHING_WARNING_CONTINUE }],
    ]);
    assert.equal(port.postMessage.called, false);
    assert.equal(port.onDisconnect.addListener.calledOnce, true);
  });

  it('links to no third-party search', function () {
    assert.doesNotMatch(PAGE, /cryptoscamdb/iu);
  });
});
