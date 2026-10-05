const path = require('path')
const fs = require('fs-extra')
const log = require('fancy-log')
const webpack = require('webpack')

const conf = require('rc')('ecf-wallet', {})

const createWebpackConfigs = require('./webpack.config')
const { createTask } = require('./task')

module.exports = createScriptTasks

function createScriptTasks ({ browserPlatforms, livereload }) {
  return {
    prod: createTask('scripts:prod', () => build({ devMode: false, testing: false })),
    test: createTask('scripts:test', () => build({ devMode: false, testing: true })),
    dev: createTask('scripts:dev', () => watch({ devMode: true, testing: false })),
    testDev: createTask('scripts:test-live', () => watch({ devMode: true, testing: true })),
  }

  async function build (opts) {
    const compiler = webpack(createWebpackConfigs({ ...opts, conf }))
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, result) => (error ? reject(error) : resolve(result)))
    })
    await new Promise((resolve, reject) => compiler.close((error) => (error ? reject(error) : resolve())))
    report(stats)
    if (stats.hasErrors()) {
      throw new Error('The script bundles failed to build')
    }
    await copyToOtherPlatforms(stats)
  }

  // Resolves after the first build; later builds trigger a live reload.
  function watch (opts) {
    const compiler = webpack(createWebpackConfigs({ ...opts, conf }))
    let firstBuild = true
    return new Promise((resolve, reject) => {
      compiler.watch({}, async (error, stats) => {
        if (error) {
          if (firstBuild) {
            reject(error)
          } else {
            log.error(error)
          }
          return
        }
        report(stats)
        if (stats.hasErrors()) {
          process.stdout.write('\x07')
          return
        }
        const files = await copyToOtherPlatforms(stats)
        if (firstBuild) {
          firstBuild = false
          resolve()
        } else {
          files.forEach((file) => livereload.changed(file))
        }
      })
    })
  }

  /**
   * Webpack writes to dist/chrome; every platform gets the same scripts.
   *
   * @param {webpack.MultiStats} stats - The finished build
   * @returns {Promise<string[]>} The scripts written, for every platform
   */
  async function copyToOtherPlatforms (stats) {
    const scripts = stats.stats
      .flatMap((child) => [...child.compilation.emittedAssets])
      .filter((asset) => asset.endsWith('.js') && !asset.includes('/'))
    const written = []
    await Promise.all(browserPlatforms.map(async (platform) => {
      await fs.ensureDir(`./dist/${platform}`)
      await Promise.all(scripts.map(async (script) => {
        const target = path.join('dist', platform, script)
        if (platform !== 'chrome') {
          await fs.copy(path.join('dist/chrome', script), target)
        }
        written.push(target)
      }))
    }))
    return written
  }
}

function report (stats) {
  const output = stats.toString({ preset: 'errors-warnings', colors: true })
  if (output.trim()) {
    log(output)
  }
}
