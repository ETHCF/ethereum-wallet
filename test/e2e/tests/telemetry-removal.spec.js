const { strict: assert } = require('assert')
const { By, Key } = require('selenium-webdriver')
const { withFixtures } = require('../helpers')

describe('Telemetry removal', function () {
  it('keeps tracking preferences and the settings toggle absent', async function () {
    await withFixtures({ fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      const password = await driver.findElement(By.id('password'))
      await password.sendKeys('correct horse battery staple', Key.ENTER)
      await driver.findElement(By.css('.selected-account__name'))
      const storage = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.local.get(['meta', 'data'], state => done(state));
      `)
      // Migration 1 moves wallets off shut-down testnets; migration 2 moves
      // site permissions to the PermissionController format.
      assert.equal(storage.meta.version, 2)
      assert.equal(Object.prototype.hasOwnProperty.call(storage.data, 'PermissionsController'), false)
      assert.deepEqual(
        storage.data.PermissionController.subjects['http://127.0.0.1:8080'].permissions.eth_accounts.caveats,
        [{ type: 'restrictReturnedAccounts', value: ['0x5cfe73b6021e818b776b421b1c4db2474086a7e1'] }],
      )
      assert.equal(Object.prototype.hasOwnProperty.call(storage.data, 'ThreeBoxController'), false)
      const preferences = storage.data.PreferencesController
      for (const key of ['metaMetricsId', 'metaMetricsSendCount', 'participateInMetaMetrics']) {
        assert.equal(Object.prototype.hasOwnProperty.call(preferences, key), false)
      }
      await driver.driver.get(`${driver.extensionUrl}/home.html#settings/security`)
      await driver.findElement(By.css('.settings-page'))
      const content = await driver.driver.executeScript('return document.body.innerText')
      assert.ok(!content.includes('MetaMetrics'))
      await driver.driver.get(`${driver.extensionUrl}/home.html#settings/advanced`)
      await driver.findElement(By.id('autoTimeout'))
      assert.equal((await driver.driver.findElements(By.css('[data-testid="advanced-setting-3box"]'))).length, 0)
    })
  })

  it('takes create and import directly to password setup without an analytics prompt', async function () {
    await withFixtures({ fixtures: 'new-wallet', title: this.test.title }, async ({ driver }) => {
      await driver.clickElement(By.css('.welcome-page button'))
      const buttons = await driver.findElements(By.css('.select-action__select-button button'))
      await buttons[1].click()
      await driver.findElement(By.id('create-password'))
      assert.ok(!(await driver.driver.getCurrentUrl()).includes('metametrics'))

      await driver.driver.get(`${driver.extensionUrl}/home.html#initialize/select-action`)
      const importButtons = await driver.findElements(By.css('.select-action__select-button button'))
      await importButtons[0].click()
      await driver.findElement(By.css('.first-time-flow__seedphrase'))
      assert.ok((await driver.driver.getCurrentUrl()).includes('import-with-seed-phrase'))
    })
  })
})
