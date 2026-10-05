const { strict: assert } = require('assert');
const { By, Key, until } = require('selenium-webdriver');

const { withFixtures } = require('../helpers');

const RECIPIENT = '0x985c30949c92df7a0bd42e0f3e3d539ece98db24';

async function findTransactionTo(chainServer, to) {
  const latest = Number(await chainServer.request('eth_blockNumber'));
  for (let number = latest; number >= 0; number--) {
    const block = await chainServer.request('eth_getBlockByNumber', [
      `0x${number.toString(16)}`,
      true,
    ]);
    const transaction = block.transactions.find((tx) => tx.to === to);
    if (transaction) {
      return transaction;
    }
  }
  return undefined;
}

describe('Custom gas price', function () {
  it('sends with the gas price the user chose on an EIP-1559 network', async function () {
    const chainOptions = {
      // A network with EIP-1559 fees, where the wallet otherwise sets fee caps.
      hardfork: 'prague',
      accounts: [
        {
          secretKey:
            '0x7C9529A67102755B7E6102D6D950AC5D5863C98713805CEC576B945B15B71EAC',
          balance: 25000000000000000000,
        },
      ],
    };
    await withFixtures(
      { fixtures: 'imported-account', chainOptions, title: this.test.title },
      async ({ driver, chainServer }) => {
        const passwordField = await driver.findElement(By.css('#password'));
        await passwordField.sendKeys('correct horse battery staple', Key.ENTER);
        await driver.clickElement(By.css('[data-testid="eth-overview-send"]'));
        await (
          await driver.findElement(By.css('[data-testid="ens-input"]'))
        ).sendKeys(RECIPIENT);
        await (
          await driver.findElement(By.css('.unit-input__input'))
        ).sendKeys('1');

        await driver.clickElement(By.css('.advanced-gas-options-btn'));
        const gasModal = await driver.findElement(By.css('span .modal'));
        const [gasPriceInput, gasLimitInput] = await driver.findElements(
          By.css('.advanced-gas-inputs__gas-edit-row__input'),
        );
        await gasPriceInput.clear();
        await gasPriceInput.sendKeys('10');
        await gasLimitInput.clear();
        await gasLimitInput.sendKeys('25000');
        // The inputs update the modal after a short debounce.
        await driver.delay(1000);
        await driver.clickElement(
          By.xpath(`//button[contains(text(), 'Save')]`),
        );
        await driver.wait(until.stalenessOf(gasModal));

        await driver.clickElement(
          By.css('[data-testid="page-container-footer-next"]'),
        );
        await driver.findElement(
          By.css('.confirm-page-container-content__details'),
        );
        const fees = await driver.findElements(
          By.css('.currency-display-component__text'),
        );
        await driver.wait(
          async () => (await fees[1].getText()) === '0.00025',
          10000,
          'the confirmation shows the chosen fee',
        );
        await driver.clickElement(
          By.css('[data-testid="page-container-footer-next"]'),
        );

        let transaction;
        await driver.wait(
          async () => {
            transaction = await findTransactionTo(chainServer, RECIPIENT);
            return Boolean(transaction);
          },
          15000,
          'the transaction is mined',
        );
        assert.equal(transaction.type, '0x0');
        assert.equal(Number(transaction.gasPrice), 10e9);
        assert.equal(Number(transaction.gas), 25000);
      },
    );
  });
});
