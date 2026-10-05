const { strict: assert } = require('assert');
const { By, Key } = require('selenium-webdriver');

const { withFixtures } = require('../helpers');

describe('Automatic transaction confirmation', function () {
  it('opens the confirmation when the wallet is in another browser window', async function () {
    await withFixtures(
      { dapp: true, fixtures: 'personal-sign', title: this.test.title },
      async ({ driver }) => {
        const password = await driver.findElement(By.id('password'));
        await password.sendKeys('correct horse battery staple', Key.ENTER);
        await driver.findElement(By.css('.selected-account__name'));
        const walletHandle = await driver.driver.getWindowHandle();
        // Leave the wallet selected in its own window, behind the dapp window.
        const dappWindow = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.windows.create({ url: 'http://127.0.0.1:8080/', focused: true }, win => done(win.id));
      `);
        const focusedWindow = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.windows.getLastFocused(win => done(win.id));
      `);
        assert.equal(focusedWindow, dappWindow);
        await driver.waitUntilXWindowHandles(2);
        const dappHandle = (await driver.getAllWindowHandles()).find(
          (handle) => handle !== walletHandle,
        );
        await driver.switchToWindow(dappHandle);
        await driver.driver.executeScript(`
        window.transactionResult = null;
        ethereum.request({ method: 'eth_accounts' }).then(([from]) =>
          ethereum.request({ method: 'eth_sendTransaction', params: [{
            from, to: '0x985c30949c92df7a0bd42e0f3e3d539ece98db24', value: '0x1', gas: '0x5208'
          }] })
        ).then(result => window.transactionResult = result,
          error => window.transactionResult = { code: error.code, message: error.message });
      `);
        await driver.waitUntilXWindowHandles(3);
        await driver.switchToWindowWithTitle(
          'ECF Wallet Notification',
          await driver.getAllWindowHandles(),
        );
        await driver.findElement(
          By.css('.confirm-page-container-content__details'),
        );
        const popup = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.windows.getCurrent(win => done({ focused: win.focused, type: win.type }));
      `);
        assert.deepEqual(popup, { focused: true, type: 'popup' });
        // Opening the confirmation must leave signing under the user's control.
        await driver.clickElement(
          By.css('[data-testid="page-container-footer-cancel"]'),
        );
        await driver.waitUntilXWindowHandles(2);
        await driver.switchToWindow(dappHandle);
        await driver.wait(async () =>
          Boolean(
            await driver.driver.executeScript(
              'return window.transactionResult',
            ),
          ),
        );
        const result = await driver.driver.executeScript(
          'return window.transactionResult',
        );
        assert.equal(result.code, 4001);
        // The provider logs the rejection that this test deliberately triggers.
        const logs = await driver.checkBrowserForConsoleErrors();
        assert.ok(
          logs.every((entry) =>
            entry.message.includes('User denied transaction signature'),
          ),
          JSON.stringify(logs),
        );
      },
    );
  });
});
