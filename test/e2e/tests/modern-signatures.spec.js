const { strict: assert } = require('assert')
const { By, Key } = require('selenium-webdriver')
const { withFixtures } = require('../helpers')

describe('Modern signature confirmations', function () {
  it('shows SIWE details, blocks mismatched domains, and signs EIP-712 V4 arrays', async function () {
    await withFixtures({ dapp: true, fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      const password = await driver.findElement(By.id('password'))
      await password.sendKeys('correct horse battery staple', Key.ENTER)
      await driver.findElement(By.css('.selected-account__name'))
      await driver.openNewPage('http://127.0.0.1:8080/')
      const dappWindow = await driver.driver.getWindowHandle()
      const capabilities = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        ethereum.request({ method: 'eth_accounts' }).then(([account]) =>
          ethereum.request({ method: 'wallet_getCapabilities', params: [account, ['0x1', '0x2105']] })
        ).then(done, error => done({ error: error.message }));
      `)
      assert.deepEqual(capabilities, {}, 'capability probes must succeed without advertising unsupported batching')
      const requestSiwe = async (domain) => driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        ethereum.request({ method: 'eth_accounts' }).then(([account]) => {
          const text = arguments[0] + ' wants you to sign in with your Ethereum account:\\n' + account +
            '\\n\\nSign in to Example.\\n\\nURI: http://127.0.0.1:8080/login\\nVersion: 1\\nChain ID: 5777\\nNonce: abcdef12\\nIssued At: 2026-09-30T00:00:00Z\\nExpiration Time: 2099-01-01T00:00:00Z';
          const hex = '0x' + Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2, '0')).join('');
          window.signingResult = null;
          ethereum.request({ method: 'personal_sign', params: [hex, account] }).then(
            result => window.signingResult = result, error => window.signingResult = { error: error.code });
          done();
        }).catch(error => done(error.message));
      `, domain)
      await requestSiwe('http://127.0.0.1:8080')
      await driver.waitUntilXWindowHandles(3)
      await driver.switchToWindowWithTitle('ECF Wallet Notification', await driver.getAllWindowHandles())
      const details = await driver.findElement(By.css('[aria-label="Sign in with Ethereum"]'))
      assert.ok((await details.getText()).includes('abcdef12'))
      await driver.clickElement(By.css('[data-testid="request-signature__sign"]'))
      await driver.waitUntilXWindowHandles(2)
      await driver.driver.switchTo().window(dappWindow)
      await driver.wait(async () => Boolean(await driver.driver.executeScript('return window.signingResult')))
      assert.match(await driver.driver.executeScript('return window.signingResult'), /^0x[0-9a-f]{130}$/iu)

      await requestSiwe('https://evil.example')
      await driver.waitUntilXWindowHandles(3)
      await driver.switchToWindowWithTitle('ECF Wallet Notification', await driver.getAllWindowHandles())
      assert.equal(await (await driver.findElement(By.css('[data-testid="request-signature__sign"]'))).isEnabled(), false)
      assert.ok((await (await driver.findElement(By.css('[role="alert"]'))).getText()).includes('does not match'))
      await driver.clickElement(By.css('.request-signature__footer__cancel-button'))
      await driver.waitUntilXWindowHandles(2)
      await driver.driver.switchTo().window(dappWindow)

      // Rejection is deliberately exercised above; the provider logs it.
      const logs = await driver.driver.manage().logs().get('browser')
      assert.ok(logs.filter((entry) => entry.level.name === 'SEVERE' || entry.level === 'SEVERE').every((entry) => entry.message.includes('User denied message signature')), JSON.stringify(logs))

      const chainIds = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        Promise.all([ethereum.request({ method: 'eth_accounts' }), ethereum.request({ method: 'eth_chainId' })]).then(([[account], chainId]) => {
          window.signingResult = null;
          const data = { types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Test: [{ name: 'values', type: 'uint256[]' }, { name: 'enabled', type: 'bool' }] },
            primaryType: 'Test', domain: { chainId }, message: { values: [1, 2], enabled: false } };
          ethereum.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify(data)] }).then(
            result => window.signingResult = result, error => window.signingResult = { error: error.message });
          done({ rpc: chainId, public: ethereum.chainId });
        }).catch(error => done(error.message));
      `)
      assert.equal(chainIds.public, chainIds.rpc, 'the public provider chain ID must match the signing chain')
      await driver.waitUntilXWindowHandles(3)
      await driver.switchToWindowWithTitle('ECF Wallet Notification', await driver.getAllWindowHandles())
      await driver.findElement(By.css('[aria-label="Signing domain"]'))
      assert.ok((await (await driver.findElement(By.css('.signature-request'))).getText()).includes('false'))
      await driver.clickElement(By.css('.signature-request-footer .btn-primary'))
      await driver.waitUntilXWindowHandles(2)
      await driver.driver.switchTo().window(dappWindow)
      await driver.wait(async () => Boolean(await driver.driver.executeScript('return window.signingResult')))
      assert.match(await driver.driver.executeScript('return window.signingResult'), /^0x[0-9a-f]{130}$/iu)
    })
  })
})
