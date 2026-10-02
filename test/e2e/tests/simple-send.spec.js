const { By, Key } = require('selenium-webdriver')
const { withFixtures } = require('../helpers')

describe('Simple send', function () {
  it('can send a simple transaction from one account to another', async function () {
    const chainOptions = {
      accounts: [
        {
          secretKey: '0x7C9529A67102755B7E6102D6D950AC5D5863C98713805CEC576B945B15B71EAC',
          balance: 25000000000000000000,
        },
      ],
    }
    await withFixtures(
      { fixtures: 'imported-account', chainOptions, title: this.test.title },
      async ({ driver }) => {
        const passwordField = await driver.findElement(By.css('#password'))
        await passwordField.sendKeys('correct horse battery staple')
        await passwordField.sendKeys(Key.ENTER)
        await driver.findElement(By.css('[data-testid="eth-overview-send"]'))
        // Reproduce the live gas service's HTML error response instead of the
        // successful canned response normally installed by the test build.
        await driver.driver.executeScript(`
          const originalFetch = window.fetch;
          window.fetch = (url, ...args) => String(url).includes('ethgasstation.info')
            ? Promise.resolve(new Response('<html><body>403 Forbidden</body></html>', {
              status: 403, headers: { 'Content-Type': 'text/html' }
            }))
            : originalFetch(url, ...args);
        `)
        await driver.clickElement(By.css('[data-testid="eth-overview-send"]'))
        const recipientAddressField = await driver.findElement(By.css('[data-testid="ens-input"]'))
        await recipientAddressField.sendKeys('0x985c30949c92df7a0bd42e0f3e3d539ece98db24')
        const amountField = await driver.findElement(By.css('.unit-input__input'))
        await amountField.sendKeys('1')
        await driver.clickElement(By.css('[data-testid="page-container-footer-next"]'))
        // The confirmation page has a Next button too; wait for it to replace
        // the send page before clicking.
        await driver.findElement(By.css('.confirm-page-container-content__details'))
        await driver.clickElement(By.css('[data-testid="page-container-footer-next"]'))
        await driver.clickElement(By.css('[data-testid="home__activity-tab"]'))
        await driver.findElement(By.css('.transaction-list-item'))
      },
    )
  })
})
