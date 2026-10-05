const { Browser } = require('selenium-webdriver');

const ChromeDriver = require('./chrome');
const Driver = require('./driver');
const FirefoxDriver = require('./firefox');

async function buildWebDriver({ responsive, port, hostResolverRules } = {}) {
  const browser = process.env.SELENIUM_BROWSER;
  const extensionPath = `dist/${browser}`;

  const {
    driver: seleniumDriver,
    extensionId,
    extensionUrl,
  } = await buildBrowserWebDriver(browser, {
    extensionPath,
    responsive,
    port,
    hostResolverRules,
  });
  const driver = new Driver(seleniumDriver, browser, extensionUrl);
  await driver.navigate();

  await driver.delay(1000);

  return {
    driver,
    extensionId,
  };
}

async function buildBrowserWebDriver(browser, webDriverOptions) {
  switch (browser) {
    case Browser.CHROME: {
      return await ChromeDriver.build(webDriverOptions);
    }
    case Browser.FIREFOX: {
      return await FirefoxDriver.build(webDriverOptions);
    }
    default: {
      throw new Error(`Unrecognized browser: ${browser}`);
    }
  }
}

module.exports = {
  buildWebDriver,
};
