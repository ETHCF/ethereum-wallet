const { promises: fs } = require('fs')
const gulp = require('gulp')
const gulpZip = require('gulp-zip')
const pify = require('pify')
const pump = pify(require('pump'))
const baseManifest = require('../../app/manifest/_base.json')
const { createTask, composeParallel } = require('./task')
const { writeBuildInfo } = require('./build-info')

module.exports = createEtcTasks

function createEtcTasks ({ browserPlatforms, livereload }) {

  const clean = createTask('clean', async function clean () {
    await fs.rm('./dist', { recursive: true, force: true })
    await Promise.all(browserPlatforms.map(async (platform) => {
      await fs.mkdir(`./dist/${platform}`, { recursive: true })
    }))
  })

  const reload = createTask('reload', function devReload () {
    livereload.listen({ port: 35729 })
  })

  // zip tasks for distribution
  const zip = createTask('zip', composeParallel(
    ...browserPlatforms.map((platform) => createZipTask(platform)),
  ))

  // Record what was built, so the wallet can show a hash anyone can recompute.
  const buildInfo = createTask('buildInfo', async function buildInfo () {
    await writeBuildInfo({ browserPlatforms })
  })

  return { clean, reload, zip, buildInfo }
}

function createZipTask (target) {
  return async () => {
    await pump(
      gulp.src(`dist/${target}/**`),
      gulpZip(`ecf-wallet-${target}-${baseManifest.version}.zip`),
      gulp.dest('builds'),
    )
  }
}
