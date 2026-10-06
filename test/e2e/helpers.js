const path = require('path');

const createStaticServer = require('../../development/create-static-server');
const Anvil = require('../anvil');
const FixtureServer = require('./fixture-server');
const { buildWebDriver } = require('./webdriver');

const tinyDelayMs = 200;
const regularDelayMs = tinyDelayMs * 2;
const largeDelayMs = regularDelayMs * 2;

const dappPort = 8080;

/**
 * Serves a dapp at http://127.0.0.1:8080.
 *
 * @param {string} [dappDirectory] - The dapp's files; the MetaMask test dapp
 * by default
 * @returns {Promise<import('http').Server>} The listening server
 */
async function startDappServer(
  dappDirectory = path.resolve(
    __dirname,
    '..',
    '..',
    'node_modules',
    '@metamask',
    'test-dapp',
    'dist',
  ),
) {
  const server = createStaticServer(dappDirectory);
  server.listen(dappPort);
  await new Promise((resolve, reject) => {
    server.on('listening', resolve);
    server.on('error', reject);
  });
  return server;
}

async function withFixtures(options, callback) {
  const { dapp, fixtures, chainOptions, driverOptions, title } = options;
  const fixtureServer = new FixtureServer();
  const chainServer = options.chainServer || new Anvil();
  let dappServer;

  let webDriver;
  try {
    await chainServer.start(chainOptions);
    await fixtureServer.start();
    await fixtureServer.loadState(path.join(__dirname, 'fixtures', fixtures));
    if (dapp) {
      dappServer = await startDappServer();
    }
    const { driver } = await buildWebDriver(driverOptions);
    webDriver = driver;

    // eslint-disable-next-line n/callback-return -- the test body is awaited, then the browser console is checked
    await callback({
      driver,
      chainServer,
    });

    if (process.env.SELENIUM_BROWSER === 'chrome') {
      const errors = await driver.checkBrowserForConsoleErrors(driver);
      if (errors.length) {
        const errorReports = errors.map((err) => err.message);
        const errorMessage = `Errors found in browser console:\n${errorReports.join('\n')}`;
        throw new Error(errorMessage);
      }
    }
  } catch (error) {
    if (webDriver) {
      await webDriver.verboseReportOnFailure(title);
    }
    throw error;
  } finally {
    await fixtureServer.stop();
    await chainServer.quit();
    if (webDriver) {
      await webDriver.quit();
    }
    if (dappServer) {
      await new Promise((resolve, reject) => {
        dappServer.close((error) => {
          if (error) {
            return reject(error);
          }
          return resolve();
        });
      });
    }
  }
}

module.exports = {
  tinyDelayMs,
  regularDelayMs,
  largeDelayMs,
  withFixtures,
  startDappServer,
};
