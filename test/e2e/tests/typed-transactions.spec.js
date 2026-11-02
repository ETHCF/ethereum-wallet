const { strict: assert } = require('assert');
const { By, Key } = require('selenium-webdriver');

const { withFixtures } = require('../helpers');

// Select-all is Command+A on macOS and Control+A elsewhere.
const SELECT_ALL = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;

async function rpc(method, params = []) {
  const response = await fetch('http://127.0.0.1:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.result;
}

// Anvil on the Prague hardfork executes the signed typed-transaction envelopes.
const PRAGUE_CHAIN = {
  chainId: 1337,
  hardfork: 'prague',
  blockTime: undefined,
};

describe('Typed transactions on a Prague chain', function () {
  it('confirms and mines EIP-1559 and EIP-2930 transactions with access lists', async function () {
    await withFixtures(
      {
        dapp: true,
        fixtures: 'personal-sign',
        chainOptions: PRAGUE_CHAIN,
        title: this.test.title,
      },
      async ({ driver }) => {
        const password = await driver.findElement(By.id('password'));
        await password.sendKeys('correct horse battery staple', Key.ENTER);
        await driver.findElement(By.css('.selected-account__name'));
        await driver.openNewPage('http://127.0.0.1:8080/');
        const dappWindow = await driver.driver.getWindowHandle();
        const account = await driver.driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        ethereum.request({ method: 'eth_accounts' }).then(accounts => done(accounts[0]));
      `);
        await rpc('anvil_setBalance', [account, '0x56bc75e2d63100000']);
        const to = `0x${'2'.repeat(40)}`;
        const accessList = [
          { address: to, storageKeys: [`0x${'0'.repeat(64)}`] },
        ];
        for (const type of ['0x2', '0x1']) {
          const params = {
            from: account,
            to,
            value: '0x1',
            type,
            chainId: '0x539',
            gas: '0x186a0',
            accessList,
            ...(type === '0x1'
              ? { gasPrice: '0x77359400' }
              : {
                  maxFeePerGas: '0x77359400',
                  maxPriorityFeePerGas: '0x3b9aca00',
                }),
          };
          await driver.driver.executeScript(
            `
          window.txResult = null;
          ethereum.request({ method: 'eth_sendTransaction', params: [arguments[0]] }).then(
            result => window.txResult = result, error => window.txResult = { error: error.message });
        `,
            params,
          );
          await driver.waitUntilXWindowHandles(3);
          await driver.switchToWindowWithTitle(
            'MetaECF Notification',
            await driver.getAllWindowHandles(),
          );
          await driver.findElement(
            By.css('.confirm-page-container-content__details'),
          );
          if (type === '0x2') {
            const cap = await driver.findElement(
              By.css('input[name="maxFeePerGas"]'),
            );
            await cap.sendKeys(SELECT_ALL, 'a', Key.NULL, '0.5');
            const confirm = await driver.findElement(
              By.css('[data-testid="page-container-footer-next"]'),
            );
            await driver.wait(async () => !(await confirm.isEnabled()));
            await cap.sendKeys(SELECT_ALL, 'a', Key.NULL, '3');
            await driver.wait(async () => await confirm.isEnabled());
          }
          await driver.clickElement(
            By.css('[data-testid="page-container-footer-next"]'),
          );
          await driver.waitUntilXWindowHandles(2);
          await driver.driver.switchTo().window(dappWindow);
          await driver.wait(async () =>
            Boolean(
              await driver.driver.executeScript('return window.txResult'),
            ),
          );
          const hash = await driver.driver.executeScript(
            'return window.txResult',
          );
          assert.equal(typeof hash, 'string', JSON.stringify(hash));
          const mined = await rpc('eth_getTransactionByHash', [hash]);
          const receipt = await rpc('eth_getTransactionReceipt', [hash]);
          assert.equal(mined.type, type);
          assert.equal(mined.chainId, '0x539');
          if (type === '0x2') {
            assert.equal(
              mined.maxFeePerGas,
              '0xb2d05e00',
              'the edited cap must be saved before approval',
            );
          }
          assert.deepEqual(mined.accessList, accessList);
          assert.equal(receipt.status, '0x1');
          assert.ok(receipt.effectiveGasPrice);
        }
      },
    );
  });
});
