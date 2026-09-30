const { strict: assert } = require('assert')
const { By, Key } = require('selenium-webdriver')
const { withFixtures } = require('../helpers')
const connectBrowser = require('../webdriver/browser-cdp')

describe('Hardware wallet connection', function () {
  it('bridges Trezor popup URLs containing SDK query parameters', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip()
    }
    await withFixtures({ fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      await driver.driver.get(`${driver.extensionUrl}/hardware.html`)
      const transport = await driver.driver.getWindowHandle()
      await driver.driver.executeScript(`
        window.trezorReply = null;
        chrome.runtime.onConnect.addListener(port => {
          if (port.name !== 'trezor-connect') return;
          port.onMessage.addListener(message => {
            if (message.data === 'ecf-test-ready') port.postMessage('ecf-test-ping');
            if (message.data === 'ecf-test-pong') window.trezorReply = message.data;
          });
        });
      `)
      await driver.driver.switchTo().newWindow('tab')
      const { targetInfo } = await driver.driver.sendAndGetDevToolsCommand('Target.getTargetInfo', {})
      const cdp = await connectBrowser(driver.driver)
      try {
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: targetInfo.targetId, flatten: true })
        // Serve a deterministic popup at the real origin. This exercises Chrome's
        // manifest matching and the packaged bridge without a device or network.
        const page = `<html><body>Trezor bridge test<script>
          window.addEventListener('message', event => {
            if (event.data === 'ecf-test-ping') window.postMessage('ecf-test-pong', location.origin);
          });
          setInterval(() => window.postMessage('ecf-test-ready', location.origin), 100);
        </script></body></html>`
        cdp.onEvent((event) => {
          if (event.method === 'Fetch.requestPaused') {
            cdp.send('Fetch.fulfillRequest', {
              requestId: event.params.requestId, responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
              body: Buffer.from(page).toString('base64'),
            }, sessionId).catch(() => undefined)
          }
        })
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://connect.trezor.io/*' }] }, sessionId)
        await driver.driver.get(`https://connect.trezor.io/9/popup.html?version=9.7.3&env=webextension&extension-id=${driver.extensionId}&cs-ver=1`)
        await driver.driver.switchTo().window(transport)
        await driver.wait(async () => (await driver.driver.executeScript('return window.trezorReply')) === 'ecf-test-pong')
        assert.equal(await driver.driver.executeScript('return window.trezorReply'), 'ecf-test-pong')
      } finally {
        cdp.close()
      }
    })
  })

  it('closes the Ledger transport after a failed connection and cleans up remaining tabs on lock', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip()
    }
    await withFixtures({ fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      const password = await driver.findElement(By.id('password'))
      await password.sendKeys('correct horse battery staple', Key.ENTER)
      await driver.findElement(By.css('.selected-account__name'))
      await driver.driver.get(`${driver.extensionUrl}/home.html#new-account/connect`)
      await driver.findElement(By.css('.hw-connect__connect-btn'))
      // Simulate the chooser returning in the wallet UI only. The transport tab
      // has no authorized device and must return an actionable error, not hang.
      await driver.driver.executeScript(`
        Object.defineProperty(window.navigator, 'hid', {
          configurable: true,
          value: { requestDevice: async () => [{}] }
        });
      `)
      await driver.clickElement(By.css('.hw-connect__btn:first-child'))
      await driver.clickElement(By.css('.hw-connect__connect-btn'))
      const error = await driver.findElement(By.css('.new-account .error, .error'))
      await driver.wait(async () => (await error.getText()).includes('Connect and authorize your Ledger'))
      const connectionTabs = () => driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [chrome.runtime.getURL('hardware.html')] }).then(done);
      `)
      assert.equal((await connectionTabs()).length, 0, 'a failed connection must close its transport tab')
      // The existing UI logs handled connection errors. Consume only that expected log.
      const logs = await driver.driver.manage().logs().get('browser')
      assert.ok(logs.every((entry) => (/ui[.]js.*Object/u).test(entry.message)), JSON.stringify(logs))
      // A manually opened transport still rejects requests from wallet tabs,
      // and the existing lock cleanup must also remove it.
      const walletWindow = await driver.driver.getWindowHandle()
      await driver.openNewPage(`${driver.extensionUrl}/hardware.html`)
      await driver.findElement(By.css('h1'))
      await driver.driver.switchTo().window(walletWindow)
      assert.equal((await connectionTabs()).length, 1)
      const response = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.runtime.sendMessage({
          type: 'ecf-wallet-hardware-request', id: 'unauthorized',
          keyringType: 'Ledger Hardware', method: 'unlock', args: [], state: { accounts: [] }
        }).then(result => done(result || null), () => done(null));
      `)
      assert.equal(response, null, 'a wallet tab must not bypass background signing approval')
      await driver.clickElement(By.css('.account-menu__icon'))
      await driver.clickElement(By.css('.account-menu__lock-button'))
      await driver.findElement(By.id('password'))
      await driver.wait(async () => (await connectionTabs()).length === 0)
    })
  })
})
