const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const { Command } = require('selenium-webdriver/lib/command');

/** @typedef {import('selenium-webdriver').ThenableWebDriver} ThenableWebDriver */

/**
 * The prefix for temporary Firefox profiles. All Firefox profiles used for e2e tests
 * will be created as random directories inside this.
 *
 * @type {string}
 */
const TEMP_PROFILE_PATH_PREFIX = path.join(
  os.tmpdir(),
  'ECF-Wallet-Fx-Profile',
);

const GeckoDriverCommand = {
  INSTALL_ADDON: 'install addon',
};

/**
 * A wrapper around a {@code WebDriver} instance exposing Firefox-specific functionality
 */
class FirefoxDriver {
  /**
   * Builds a {@link FirefoxDriver} instance
   *
   * @param {object} options - the options for the build
   * @param {string} options.extensionPath - the path to the unpacked extension
   * @param {boolean} [options.responsive] - whether to use a phone-sized window
   * @param {number} [options.port] - the port for the geckodriver service
   * @returns {Promise<{driver: !ThenableWebDriver, extensionUrl: string, extensionId: string}>} The driver and the installed extension's URL and ID
   */
  static async build({ extensionPath, responsive, port }) {
    const templateProfile = fs.mkdtempSync(TEMP_PROFILE_PATH_PREFIX);
    const internalExtensionId = randomUUID();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'),
    );
    const addonId = manifest.browser_specific_settings.gecko.id;
    const options = new firefox.Options()
      .setProfile(templateProfile)
      .setPreference(
        'extensions.webextensions.uuids',
        JSON.stringify({ [addonId]: internalExtensionId }),
      );
    if (process.env.SELENIUM_HEADLESS === 'true') {
      options.addArguments('-headless');
    }
    // Firefox refuses WebDriver navigation to moz-extension: pages without this.
    const service = new firefox.ServiceBuilder().addArguments(
      '--allow-system-access',
    );
    if (port) {
      service.setPort(port);
    }
    const driver = new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build();
    const fxDriver = new FirefoxDriver(driver);

    await fxDriver.init();

    const extensionId = await fxDriver.installExtension(extensionPath);

    if (responsive) {
      await driver.manage().window().setRect({ width: 320, height: 600 });
    }

    return {
      driver,
      extensionId,
      extensionUrl: `moz-extension://${internalExtensionId}`,
    };
  }

  /**
   * Wraps a WebDriver instance for Firefox.
   *
   * @class
   * @param {!ThenableWebDriver} driver - a {@code WebDriver} instance
   */
  constructor(driver) {
    this._driver = driver;
  }

  /**
   * Initializes the driver
   *
   * @returns {Promise<void>}
   */
  async init() {
    await this._driver
      .getExecutor()
      .defineCommand(
        GeckoDriverCommand.INSTALL_ADDON,
        'POST',
        '/session/:sessionId/moz/addon/install',
      );
  }

  /**
   * Installs the extension at the given path
   *
   * @param {string} addonPath - the path to the unpacked extension or XPI
   * @returns {Promise<string>} the extension ID
   */
  async installExtension(addonPath) {
    const cmd = new Command(GeckoDriverCommand.INSTALL_ADDON)
      .setParameter('path', path.resolve(addonPath))
      .setParameter('temporary', true);

    return await this._driver.execute(cmd);
  }
}

module.exports = FirefoxDriver;
