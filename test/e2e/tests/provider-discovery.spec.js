const { strict: assert } = require('assert');

const { withFixtures } = require('../helpers');
const connectBrowser = require('../webdriver/browser-cdp');

describe('Wallet provider discovery', function () {
  // 'empty-getter': a wallet that claims window.ethereum with a getter that returns nothing yet.
  for (const otherWallet of [false, 'readonly', 'getter', 'empty-getter']) {
    it(`announces ECF Wallet ${otherWallet ? `alongside an existing ${otherWallet} wallet` : 'and exposes the legacy provider without web3'}`, async function () {
      if (process.env.SELENIUM_BROWSER !== 'chrome') {
        this.skip();
      }
      await withFixtures(
        { fixtures: 'personal-sign', title: this.test.title },
        async ({ driver }) => {
          const cdp = await connectBrowser(driver.driver);
          try {
            const { targetInfo } =
              await driver.driver.sendAndGetDevToolsCommand(
                'Target.getTargetInfo',
                {},
              );
            const { sessionId } = await cdp.send('Target.attachToTarget', {
              targetId: targetInfo.targetId,
              flatten: true,
            });
            await cdp.send('Page.enable', {}, sessionId);
            await cdp.send(
              'Page.addScriptToEvaluateOnNewDocument',
              {
                source: `
              window.announcements = [];
              window.initializedEvents = 0;
              window.addEventListener('eip6963:announceProvider', event => announcements.push(event.detail));
              window.addEventListener('ethereum#initialized', () => initializedEvents++);
              if (${Boolean(otherWallet)}) {
                window.otherProvider = { request: () => Promise.resolve('other-wallet') };
                Object.defineProperty(window, 'ethereum', ${{ getter: '{ get: () => otherProvider }', 'empty-getter': '{ get: () => undefined }' }[otherWallet] || '{ value: otherProvider, writable: false }'});
                window.web3 = { currentProvider: otherProvider };
              }
            `,
              },
              sessionId,
            );
            cdp.onEvent((event) => {
              if (event.method === 'Fetch.requestPaused') {
                cdp
                  .send(
                    'Fetch.fulfillRequest',
                    {
                      requestId: event.params.requestId,
                      responseCode: 200,
                      responseHeaders: [
                        { name: 'Content-Type', value: 'text/html' },
                      ],
                      body: Buffer.from(
                        '<html><body>Wallet discovery</body></html>',
                      ).toString('base64'),
                    },
                    sessionId,
                  )
                  .catch(() => undefined);
              }
            });
            await cdp.send(
              'Fetch.enable',
              { patterns: [{ urlPattern: 'http://wallet-discovery.test/*' }] },
              sessionId,
            );
            // Plain HTTP also exercises discovery without crypto.randomUUID().
            await driver.driver.get('http://wallet-discovery.test/');
            const initial = await driver.driver.executeScript(
              'return announcements.length',
            );
            assert.equal(
              initial,
              1,
              'announce on injection for listeners already registered',
            );
            const discovery = await driver.driver.executeScript(`
            window.dispatchEvent(new Event('eip6963:requestProvider'));
            window.dispatchEvent(new Event('eip6963:requestProvider'));
            const first = announcements[0];
            return {
              info: first.info,
              stable: announcements.length === 3 && announcements.every(item =>
                item.info.uuid === first.info.uuid && item.provider === first.provider),
              frozen: Object.isFrozen(first) && Object.isFrozen(first.info),
              legacy: window.ethereum === ${{ false: 'first.provider', 'empty-getter': 'undefined' }[otherWallet] || 'otherProvider'},
              web3: ${otherWallet ? 'window.web3.currentProvider === otherProvider' : 'window.web3 === undefined'},
              initializedEvents,
              secureContext: window.isSecureContext
            };
          `);
            assert.equal(discovery.info.name, 'ECF Wallet');
            assert.equal(discovery.info.rdns, 'org.ethcf.wallet');
            assert.match(
              discovery.info.uuid,
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
            );
            assert.ok(discovery.info.icon.startsWith('data:image/svg+xml,'));
            assert.ok(decodeURIComponent(discovery.info.icon).includes('<svg'));
            assert.equal(discovery.stable, true);
            assert.equal(discovery.frozen, true);
            assert.equal(discovery.legacy, true);
            assert.equal(discovery.web3, true);
            assert.equal(discovery.initializedEvents, otherWallet ? 0 : 1);
            assert.equal(discovery.secureContext, false);
            const response = await driver.driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            const provider = announcements[0].provider;
            Promise.all([
              provider.request({ method: 'eth_chainId' }),
              provider.request({ method: 'eth_accounts' })
            ]).then(done, error => done({ error: error.message }));
          `);
            assert.deepEqual(
              response,
              ['0x539', []],
              'the announced provider reaches ECF without granting account access',
            );
          } finally {
            cdp.close();
          }
        },
      );
    });
  }
});
