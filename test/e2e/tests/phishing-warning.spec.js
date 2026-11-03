const { strict: assert } = require('assert');
const { By } = require('selenium-webdriver');

const { withFixtures } = require('../helpers');

// A look-alike of metamask.io, which the phishing list matches loosely, so it
// stays flagged as the list is updated. Served here by the local dapp server.
const PHISHING_SITE = 'http://metamaskk.io:8080/';
const WARNING_TITLE = 'Ethereum Phishing Detection - MetaECF';
// The local dapp frames WalletConnect's verify page, which refuses to be framed
// by this look-alike host and logs a console error. Keep the test off that host.
const HOST_RESOLVER_RULES =
  'MAP metamaskk.io 127.0.0.1, MAP verify.walletconnect.com ~NOTFOUND';

describe('Phishing warning', function () {
  it('replaces a listed site, which websites cannot do, and continues to that site only', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip();
    }
    await withFixtures(
      {
        dapp: true,
        fixtures: 'personal-sign',
        title: this.test.title,
        driverOptions: {
          hostResolverRules: HOST_RESOLVER_RULES,
        },
      },
      async ({ driver }) => {
        const warningUrl = `${driver.extensionUrl}/phishing.html`;

        // A website cannot load the warning page, so it cannot frame it or
        // pass it a site to allow.
        await driver.openNewPage('http://127.0.0.1:8080/');
        const fromWebsite = await driver.driver.executeAsyncScript(
          `const done = arguments[arguments.length - 1];
          fetch(${JSON.stringify(warningUrl)}).then(
            () => done('loaded'),
            () => done('blocked'),
          );`,
        );
        assert.equal(fromWebsite, 'blocked');
        // Chrome reports the refused extension resource as an error. Reading
        // the log here takes the entry out of the end-of-test console check.
        const logs = await driver.driver.manage().logs().get('browser');
        assert.deepEqual(
          logs
            .filter(({ level }) => level.toString() === 'SEVERE')
            .map(({ message }) => message),
          [
            'chrome-extension://invalid/ - Failed to load resource: net::ERR_FAILED',
          ],
        );

        await driver.driver.get(PHISHING_SITE);
        await driver.wait(
          async () => (await driver.driver.getTitle()) === WARNING_TITLE,
        );
        assert.equal(await driver.driver.getCurrentUrl(), warningUrl);

        await driver.clickElement(By.id('unsafe-continue'));
        await driver.wait(
          async () =>
            (await driver.driver.getCurrentUrl()) === PHISHING_SITE &&
            (await driver.driver.getTitle()) !== WARNING_TITLE,
        );
        // Allowed for the session: the site loads and keeps its provider.
        await driver.delay(1000);
        assert.equal(await driver.driver.getCurrentUrl(), PHISHING_SITE);
        assert.equal(
          await driver.driver.executeScript('return typeof window.ethereum'),
          'object',
        );
      },
    );
  });

  it('warns on a listed site that makes itself skip the provider', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip();
    }
    await withFixtures(
      {
        dapp: true,
        fixtures: 'personal-sign',
        title: this.test.title,
        driverOptions: {
          hostResolverRules: HOST_RESOLVER_RULES,
        },
      },
      async ({ driver }) => {
        // The provider is not injected on pages whose URL names one of a few
        // domains, so this page gets no provider and never connects.
        await driver.driver.get(`${PHISHING_SITE}#dropbox.com`);
        await driver.wait(
          async () => (await driver.driver.getTitle()) === WARNING_TITLE,
        );
        assert.equal(
          await driver.driver.getCurrentUrl(),
          `${driver.extensionUrl}/phishing.html`,
        );
      },
    );
  });
});
