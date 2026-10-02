const path = require('path')
const { Builder } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const connectBrowser = require('./browser-cdp')

/**
 * A wrapper around a {@code WebDriver} instance exposing Chrome-specific functionality
 */
class ChromeDriver {
  static async build ({ extensionPath, responsive, port }) {
    const args = [
      '--enable-unsafe-extension-debugging',
    ]
    if (responsive && process.env.SELENIUM_HEADLESS === 'true') {
      // Headless Chrome shows no DevTools panel to narrow the page, so use a
      // phone-sized window instead.
      args.push('--window-size=400,900')
    } else if (responsive) {
      args.push('--auto-open-devtools-for-tabs')
    } else {
      // Without an explicit size the window is whatever Chrome defaults to,
      // which differs between headless and headed runs and clips tall menus.
      args.push('--window-size=1280,1024')
    }
    const options = new chrome.Options()
      .addArguments(args)
    if (process.env.SELENIUM_HEADLESS === 'true') {
      options.addArguments('--headless=new')
    }
    options.get('goog:chromeOptions').enableExtensionTargets = true
    const builder = new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
    if (port) {
      const service = new chrome.ServiceBuilder()
        .setPort(port)
      builder.setChromeService(service)
    }
    const driver = builder.build()
    // Branded Chrome no longer accepts --load-extension. CDP's extension
    // debugging API loads unpacked extensions in this isolated test profile.
    let extensionId
    const connection = await connectBrowser(driver)
    try {
      const result = await connection.send('Extensions.loadUnpacked', { path: path.resolve(extensionPath) })
      extensionId = result.id
    } catch (error) {
      await driver.quit()
      throw error
    } finally {
      connection.close()
    }

    return {
      driver,
      extensionId,
      extensionUrl: `chrome-extension://${extensionId}`,
    }
  }

}

module.exports = ChromeDriver
