const { strict: assert } = require('assert')
const { By, Key } = require('selenium-webdriver')
const { withFixtures } = require('../helpers')

const PASSWORD = 'correct horse battery staple'

async function unlock (driver) {
  const password = await driver.findElement(By.id('password'))
  await password.sendKeys(PASSWORD, Key.ENTER)
  await driver.findElement(By.css('.selected-account__name'))
}

// Starts a provider request in the dapp and stores its outcome on window.
function startRequest (driver, name, request) {
  return driver.driver.executeScript(`
    window[${JSON.stringify(name)}] = null;
    ethereum.request(${JSON.stringify(request)}).then(
      result => window[${JSON.stringify(name)}] = { result },
      error => window[${JSON.stringify(name)}] = { code: error.code, message: error.message },
    );
  `)
}

async function requestResult (driver, name) {
  await driver.wait(async () => Boolean(await driver.driver.executeScript(`return window[${JSON.stringify(name)}]`)))
  return driver.driver.executeScript(`return window[${JSON.stringify(name)}]`)
}

async function requestNow (driver, req) {
  await startRequest(driver, 'immediate', req)
  return requestResult(driver, 'immediate')
}

async function respondInNotification (driver, testId) {
  await driver.waitUntilXWindowHandles(3)
  await driver.switchToWindowWithTitle('ECF Wallet Notification', await driver.getAllWindowHandles())
  const text = await (await driver.findElement(By.css('[data-testid="confirm-network-request"]'))).getText()
  await driver.clickElement(By.css(`[data-testid="${testId}"]`))
  await driver.waitUntilXWindowHandles(2)
  return text
}

describe('Security hardening', function () {
  it('runs the wallet with frozen JavaScript intrinsics', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip()
    }
    await withFixtures({ fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      await unlock(driver)
      const page = await driver.driver.executeScript(`
        const original = Promise
        try {
          globalThis.Promise = function () {}
        } catch (_) {}
        return {
          lockdown: typeof lockdown,
          frozen: Object.isFrozen(Array.prototype) && Object.isFrozen(Object),
          promiseReplaced: globalThis.Promise !== original,
        }
      `)
      assert.deepEqual(page, { lockdown: 'function', frozen: true, promiseReplaced: false })

      const { targetInfos } = await driver.driver.sendAndGetDevToolsCommand('Target.getTargets', {})
      const worker = targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(driver.extensionUrl))
      assert.ok(worker, 'service worker is running')
    })
  })

  it('refuses eth_sign and offers no way to approve it', async function () {
    await withFixtures({ dapp: true, fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      await unlock(driver)
      await driver.openNewPage('http://127.0.0.1:8080/')
      const { result: [account] } = await requestNow(driver, { method: 'eth_accounts' })
      assert.ok(account, 'the fixture dapp is connected')
      const result = await requestNow(driver, { method: 'eth_sign', params: [account, `0x${'11'.repeat(32)}`] })
      assert.equal(result.code, -32601)
      assert.match(result.message, /eth_sign is disabled/u)
      assert.equal((await driver.getAllWindowHandles()).length, 2, 'no approval window opens')
      await driver.driver.manage().logs().get('browser')
    })
  })

  it('adds and switches networks only after approval, with validation and warnings', async function () {
    await withFixtures({ dapp: true, fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      await unlock(driver)
      await driver.openNewPage('http://127.0.0.1:8080/')
      assert.equal((await requestNow(driver, { method: 'eth_chainId' })).result, '0x539')

      // Rejected before any prompt: the RPC serves a different chain.
      const mismatch = await requestNow(driver, {
        method: 'wallet_addEthereumChain',
        params: [{ chainId: '0x64', chainName: 'Gnosis', rpcUrls: ['http://127.0.0.1:8545'], nativeCurrency: { symbol: 'XDAI', decimals: 18 } }],
      })
      assert.equal(mismatch.code, -32602)
      assert.match(mismatch.message, /different chain ID/u)
      const insecure = await requestNow(driver, {
        method: 'wallet_addEthereumChain',
        params: [{ chainId: '0x539', chainName: 'Remote', rpcUrls: ['http://rpc.example.com'] }],
      })
      assert.equal(insecure.code, -32602)

      // Unknown chains must be added first.
      assert.equal((await requestNow(driver, { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x64' }] })).code, 4902)

      // Rejecting an add leaves the network unchanged.
      const addRequest = {
        method: 'wallet_addEthereumChain',
        params: [{ chainId: '0x539', chainName: 'Local Test Chain', rpcUrls: ['http://127.0.0.1:8545'], nativeCurrency: { symbol: 'TEST', decimals: 18 } }],
      }
      const dappHandle = await driver.driver.getWindowHandle()
      await startRequest(driver, 'rejected', addRequest)
      const prompt = await respondInNotification(driver, 'network-request-reject')
      assert.match(prompt, /Local Test Chain/u)
      assert.match(prompt, /1337 \(0x539\)/u)
      assert.match(prompt, /chose the RPC provider/u)
      assert.match(prompt, /doesn’t recognize this network/u)
      assert.match(prompt, /unencrypted HTTP/u)
      await driver.switchToWindow(dappHandle)
      assert.equal((await requestResult(driver, 'rejected')).code, 4001)

      // Approving adds the network and selects it.
      await startRequest(driver, 'added', addRequest)
      await respondInNotification(driver, 'network-request-approve')
      await driver.switchToWindow(dappHandle)
      assert.deepEqual(await requestResult(driver, 'added'), { result: null })

      // Switch to a built-in network, then back to the added one.
      await startRequest(driver, 'toMainnet', { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })
      const switchPrompt = await respondInNotification(driver, 'network-request-approve')
      assert.match(switchPrompt, /Ethereum Mainnet/u)
      await driver.switchToWindow(dappHandle)
      assert.deepEqual(await requestResult(driver, 'toMainnet'), { result: null })
      await driver.wait(async () => (await requestNow(driver, { method: 'eth_chainId' })).result === '0x1')

      await startRequest(driver, 'back', { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x539' }] })
      await respondInNotification(driver, 'network-request-approve')
      await driver.switchToWindow(dappHandle)
      assert.deepEqual(await requestResult(driver, 'back'), { result: null })
      await driver.wait(async () => (await requestNow(driver, { method: 'eth_chainId' })).result === '0x539')

      const walletHandle = (await driver.getAllWindowHandles()).find((handle) => handle !== dappHandle)
      await driver.switchToWindow(walletHandle)
      const { data: { PreferencesController, NetworkController } } = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.local.get(['data'], done);
      `)
      assert.ok(PreferencesController.frequentRpcListDetail.some((rpc) => rpc.rpcUrl === 'http://127.0.0.1:8545/' && rpc.chainId === '0x539' && rpc.nickname === 'Local Test Chain'))
      assert.equal(NetworkController.provider.rpcTarget, 'http://127.0.0.1:8545/')
      // The provider logs the rejections this test deliberately triggers.
      await driver.driver.manage().logs().get('browser')
    })
  })

  it('reveals the seed phrase only after the quiz, the password and a long press, and clears the clipboard', async function () {
    if (process.env.SELENIUM_BROWSER !== 'chrome') {
      this.skip()
    }
    await withFixtures({ fixtures: 'personal-sign', title: this.test.title }, async ({ driver }) => {
      await unlock(driver)
      await driver.driver.get(`${driver.extensionUrl}/home.html#seed`)
      await driver.findElement(By.css('[data-testid="srp-quiz"]'))
      assert.equal((await driver.driver.findElements(By.id('password-box'))).length, 0)

      await driver.clickElement(By.css('[data-testid="srp-quiz-wrong-answer"]'))
      await driver.clickElement(By.css('[data-testid="srp-quiz-try-again"]'))
      for (let question = 0; question < 2; question++) {
        await driver.clickElement(By.css('[data-testid="srp-quiz-right-answer"]'))
        await driver.clickElement(By.css('[data-testid="srp-quiz-continue"]'))
      }

      const passwordBox = await driver.findElement(By.id('password-box'))
      await passwordBox.sendKeys(PASSWORD, Key.ENTER)
      const holdButton = await driver.findElement(By.css('[data-testid="hold-to-reveal-button"]'))
      await holdButton.click()
      await driver.delay(2500)
      assert.equal((await driver.driver.findElements(By.css('.export-text-container__text'))).length, 0, 'a click does not reveal')

      await driver.driver.actions({ async: true }).move({ origin: holdButton }).press().pause(2500).release().perform()
      const seed = await (await driver.findElement(By.css('.export-text-container__text'))).getText()
      assert.equal(seed.split(' ').length, 12)

      await driver.clickElement(By.css('.export-text-container__button--copy'))
      await driver.findElement(By.css('[data-testid="sensitive-clipboard-warning"]'))
      const alarm = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.alarms.get('ecf-wallet-clear-clipboard', (alarm) => done(alarm && alarm.scheduledTime - Date.now()));
      `)
      assert.ok(alarm > 50000 && alarm <= 60000, `clear scheduled in ${alarm}ms`)

      await driver.clickElement(By.css('[data-testid="clear-sensitive-clipboard"]'))
      await driver.findElement(By.css('[data-testid="sensitive-clipboard-cleared"]'))
      const cleared = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.alarms.get('ecf-wallet-clear-clipboard', (alarm) => done(!alarm));
      `)
      assert.equal(cleared, true)
    })
  })
})
