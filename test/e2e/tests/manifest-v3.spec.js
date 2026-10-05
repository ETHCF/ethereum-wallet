const { strict: assert } = require('assert');
const { By, Key } = require('selenium-webdriver');

const { withFixtures } = require('../helpers');

describe('Manifest V3 lifecycle', function () {
  it('rejects requests after an extension reload without breaking the page transport', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip();
    }
    await withFixtures(
      { dapp: true, fixtures: 'personal-sign', title: this.test.title },
      async ({ driver }) => {
        const walletHandle = await driver.driver.getWindowHandle();
        await driver.driver.switchTo().newWindow('tab');
        const dappHandle = await driver.driver.getWindowHandle();
        await driver.driver.get('http://127.0.0.1:8080/');
        const requestChainId = () =>
          driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        window.ethereum.request({ method: 'eth_chainId' }).then(
          value => done({ value }), error => done({ code: error.code, message: error.message })
        );
      `);
        const before = await requestChainId();
        assert.ok(before.value, JSON.stringify(before));

        await driver.switchToWindow(walletHandle);
        await driver.driver.executeScript(
          'setTimeout(() => chrome.runtime.reload(), 100)',
        );
        await driver.switchToWindow(dappHandle);
        let disconnected;
        await driver.wait(async () => {
          disconnected = await requestChainId();
          return disconnected.code === 4900;
        });
        assert.match(disconnected.message, /refresh/iu);
        assert.deepEqual(await requestChainId(), disconnected);
        // The provider logs RPC errors; the content-script multiplex must stay alive.
        const logs = await driver.checkBrowserForConsoleErrors();
        assert.ok(
          logs.every((entry) =>
            entry.message.includes('Please refresh this page to reconnect'),
          ),
          JSON.stringify(logs),
        );
      },
    );
  });

  it('automatically locks after the worker stops', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip();
    }
    await withFixtures(
      { fixtures: 'personal-sign', title: this.test.title },
      async ({ driver }) => {
        const password = await driver.findElement(By.id('password'));
        await password.sendKeys('correct horse battery staple', Key.ENTER);
        await driver.findElement(By.css('.selected-account__name'));
        await driver.driver.get(
          `${driver.extensionUrl}/home.html#settings/advanced`,
        );
        const timeout = await driver.findElement(By.id('autoTimeout'));
        await timeout.clear();
        await timeout.sendKeys('0.1');
        await driver.clickElement(
          By.css('[data-testid="advanced-setting-auto-lock"] button'),
        );
        await driver.wait(async () =>
          driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.alarms.get('ecf-wallet-auto-lock', alarm => done(Boolean(alarm)));
      `),
        );
        await driver.driver.get('about:blank');
        const getWorkers = async () => {
          const { targetInfos } = await driver.driver.sendAndGetDevToolsCommand(
            'Target.getTargets',
            {},
          );
          return targetInfos.filter(
            (target) =>
              target.type === 'service_worker' &&
              target.url.startsWith(driver.extensionUrl),
          );
        };
        const [worker] = await getWorkers();
        assert.ok(worker);
        await driver.driver.sendAndGetDevToolsCommand(
          'ServiceWorker.enable',
          {},
        );
        await driver.driver.sendAndGetDevToolsCommand(
          'ServiceWorker.stopAllWorkers',
          {},
        );
        await driver.wait(
          async () =>
            !(await getWorkers()).some(
              (target) => target.targetId === worker.targetId,
            ),
        );
        await driver.wait(async () => (await getWorkers()).length > 0);
        await driver.navigate();
        await driver.findElement(By.id('password'));
      },
    );
  });

  it('restores the wallet and dapp transport after worker termination, but preserves explicit locking', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip();
    }
    await withFixtures(
      { dapp: true, fixtures: 'personal-sign', title: this.test.title },
      async ({ driver }) => {
        const password = await driver.findElement(By.id('password'));
        await password.sendKeys('correct horse battery staple', Key.ENTER);
        await driver.findElement(By.css('.selected-account__name'));
        const manifestVersion = await driver.driver.executeScript(
          'return chrome.runtime.getManifest().manifest_version',
        );
        assert.equal(manifestVersion, 3);

        const home = driver.extensionUrl;
        await driver.driver.get('http://127.0.0.1:8080/');
        const requestChainId = () =>
          driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        window.ethereum.request({ method: 'eth_chainId' }).then(
          value => done({ value }), error => done({ error: error.message })
        );
      `);
        const before = await requestChainId();
        assert.ok(before.value, JSON.stringify(before));
        const getWorker = async () => {
          const { targetInfos } = await driver.driver.sendAndGetDevToolsCommand(
            'Target.getTargets',
            {},
          );
          return targetInfos.find(
            (target) =>
              target.type === 'service_worker' && target.url.startsWith(home),
          );
        };
        const worker = await getWorker();
        assert.ok(worker);
        await driver.driver.sendAndGetDevToolsCommand(
          'ServiceWorker.enable',
          {},
        );
        await driver.driver.sendAndGetDevToolsCommand(
          'ServiceWorker.stopAllWorkers',
          {},
        );
        await driver.wait(
          async () => (await getWorker())?.targetId !== worker.targetId,
        );
        assert.deepEqual(await requestChainId(), before);

        await driver.navigate();
        await driver.findElement(By.css('.selected-account__name'));
        assert.equal(
          (await driver.driver.findElements(By.id('password'))).length,
          0,
        );
        await driver.clickElement(By.css('.account-menu__icon'));
        await driver.clickElement(By.css('.account-menu__lock-button'));
        await driver.findElement(By.id('password'));
        await driver.wait(async () =>
          driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.session.get('ecfWalletVaultKey', value => done(!value.ecfWalletVaultKey));
      `),
        );
        await driver.driver.get('about:blank');
        await driver.driver.sendAndGetDevToolsCommand(
          'ServiceWorker.stopAllWorkers',
          {},
        );
        await driver.navigate();
        await driver.findElement(By.id('password'));
      },
    );
  });
});
