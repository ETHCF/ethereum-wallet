const { promises: fs } = require('fs')
const { merge, cloneDeep } = require('lodash')

const baseManifest = require('../../app/manifest/_base.json')

const { createTask, composeSeries } = require('./task')

module.exports = createManifestTasks

function createManifestTasks ({ browserPlatforms }) {

  // merge base manifest with per-platform manifests
  const prepPlatforms = async () => {
    return Promise.all(browserPlatforms.map(async (platform) => {
      const platformModifications = await readJson(`${__dirname}/../../app/manifest/${platform}.json`)
      const result = merge(cloneDeep(baseManifest), platformModifications)
      if (platform === 'firefox') {
        result.background = { scripts: ['transaction-codec.js', 'background.js'] }
      } else {
        result.minimum_chrome_version = '120'
      }
      const dir = `./dist/${platform}`
      await fs.mkdir(dir, { recursive: true })
      await writeJson(result, `${dir}/manifest.json`)
    }))
  }

  // high level manifest tasks
  const dev = createTask('manifest:dev', composeSeries(
    prepPlatforms,
  ))

  const testDev = createTask('manifest:testDev', composeSeries(
    prepPlatforms,
  ))

  const test = createTask('manifest:test', composeSeries(
    prepPlatforms,
  ))

  const prod = createTask('manifest:prod', prepPlatforms)

  return { prod, dev, testDev, test }

}

// helper for reading and deserializing json from fs
async function readJson (path) {
  return JSON.parse(await fs.readFile(path, 'utf8'))
}

// helper for serializing and writing json to fs
async function writeJson (obj, path) {
  return fs.writeFile(path, JSON.stringify(obj, null, 2))
}
