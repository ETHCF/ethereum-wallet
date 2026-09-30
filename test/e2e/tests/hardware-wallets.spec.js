const { strict: assert } = require('assert')
const { By, Key } = require('selenium-webdriver')
const { withFixtures } = require('../helpers')

describe('Hardware wallet connection', function () {
  it('loads the packaged Ledger transport, reports missing authorization, and closes it on lock', async function () {
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
      assert.equal((await connectionTabs()).length, 1)
      // The existing UI logs handled connection errors. Consume only that expected log.
      const logs = await driver.driver.manage().logs().get('browser')
      assert.ok(logs.every((entry) => (/ui[.]js.*Object/u).test(entry.message)), JSON.stringify(logs))
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
