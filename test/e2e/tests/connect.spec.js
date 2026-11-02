const { strict: assert } = require('assert');
const { By, Key } = require('selenium-webdriver');

const { withFixtures } = require('../helpers');

const ACCOUNT = '0x5cfe73b6021e818b776b421b1c4db2474086a7e1';

describe('Connecting a site', function () {
  it('grants a new site its accounts after the user approves', async function () {
    await withFixtures(
      { dapp: true, fixtures: 'imported-account', title: this.test.title },
      async ({ driver }) => {
        await (
          await driver.findElement(By.id('password'))
        ).sendKeys('correct horse battery staple', Key.ENTER);
        await driver.findElement(By.css('.selected-account__name'));
        await driver.openNewPage('http://127.0.0.1:8080/');
        const dappHandle = await driver.driver.getWindowHandle();
        await driver.driver.executeScript(`
        window.events = [];
        window.ethereum.on('accountsChanged', (accounts) => events.push(accounts));
        window.connection = null;
        window.ethereum.request({ method: 'eth_requestAccounts' }).then(
          (result) => { window.connection = { result } },
          (error) => { window.connection = { code: error.code, message: error.message } },
        );
      `);
        await driver.waitUntilXWindowHandles(3);
        await driver.switchToWindowWithTitle(
          'MetaECF Notification',
          await driver.getAllWindowHandles(),
        );
        await driver.clickElement(
          By.css(
            '.permissions-connect-choose-account__bottom-buttons .btn-primary',
          ),
        );
        await driver.clickElement(By.xpath(`//button[contains(., 'Connect')]`));
        await driver.waitUntilXWindowHandles(2);
        await driver.switchToWindow(dappHandle);
        await driver.wait(async () =>
          Boolean(
            await driver.driver.executeScript('return window.connection'),
          ),
        );
        assert.deepEqual(
          await driver.driver.executeScript('return window.connection'),
          { result: [ACCOUNT] },
        );
        const accounts = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        window.ethereum.request({ method: 'eth_accounts' }).then(done, (error) => done({ error: error.message }));
      `);
        assert.deepEqual(accounts, [ACCOUNT]);
        assert.deepEqual(
          await driver.driver.executeScript(
            'return window.ethereum.selectedAddress',
          ),
          ACCOUNT,
        );
        assert.deepEqual(
          await driver.driver.executeScript('return window.events.at(-1)'),
          [ACCOUNT],
        );
      },
    );
  });
});
