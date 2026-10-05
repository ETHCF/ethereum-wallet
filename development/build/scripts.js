const gulp = require('gulp')
const esbuild = require('esbuild')
const fs = require('fs-extra')
const watch = require('gulp-watch')
const source = require('vinyl-source-stream')
const buffer = require('vinyl-buffer')
const log = require('fancy-log')
const { assign } = require('lodash')
const watchify = require('watchify')
const browserify = require('browserify')
const envify = require('envify/custom')
const sourcemaps = require('gulp-sourcemaps')
const lavamoat = require('lavamoat-browserify')
const pify = require('pify')
const endOfStream = pify(require('end-of-stream'))
const { makeStringTransform } = require('browserify-transform-tools')

const conf = require('rc')('ecf-wallet', {})

const packageJSON = require('../../package.json')
const browserOptions = require('./browser-options')
const terser = require('./terser-stream')
const { createTask, composeParallel, runInChildProcess } = require('./task')

module.exports = createScriptTasks

// SES lockdown freezes the intrinsics before bundles run (see
// app/lockdown-run.js). The symbol-observable ponyfill adds a property to the
// frozen Symbol constructor, which then throws; use a local symbol instead.
const sesCompatibilityTransform = makeStringTransform('ses-compatibility', { includeExtensions: ['.js'] }, (content, { file }, cb) => {
  if (!(/[\\/]symbol-observable[\\/](lib|es)[\\/]ponyfill\.js$/u).test(file)) {
    cb(null, content)
    return
  }
  const mutation = /\b_?Symbol\.observable = result;/u
  if (!mutation.test(content)) {
    cb(new Error(`ses-compatibility: unexpected contents in ${file}`))
    return
  }
  cb(null, content.replace(mutation, ''))
})

const dependencies = Object.keys((packageJSON && packageJSON.dependencies) || {})
const reactDepenendencies = dependencies.filter((dep) => dep.match(/react/u))

const externalDependenciesMap = {
  ui: [
    ...reactDepenendencies,
  ],
}

function createScriptTasks ({ browserPlatforms, livereload }) {

  // internal tasks
  const core = {
    // dev tasks (live reload)
    dev: createTasksForBuildJsExtension({ taskPrefix: 'scripts:core:dev', devMode: true }),
    testDev: createTasksForBuildJsExtension({ taskPrefix: 'scripts:core:test-live', devMode: true, testing: true }),
    // built for CI tests
    test: createTasksForBuildJsExtension({ taskPrefix: 'scripts:core:test', testing: true }),
    // production
    prod: createTasksForBuildJsExtension({ taskPrefix: 'scripts:core:prod' }),
  }
  const deps = {
    ui: createTasksForBuildJsDeps({ filename: 'ui-libs', key: 'ui' }),
  }

  // high level tasks

  const prod = composeParallel(
    deps.ui,
    core.prod,
  )

  const { dev, testDev } = core

  const test = composeParallel(
    deps.ui,
    core.test,
  )

  return { prod, dev, testDev, test }

  function createTasksForBuildJsDeps ({ key, filename }) {
    return createTask(`scripts:deps:${key}`, bundleTask({
      label: filename,
      filename: `${filename}.js`,
      buildLib: true,
      dependenciesToBundle: externalDependenciesMap[key],
      devMode: false,
    }))
  }

  function createTasksForBuildJsExtension ({ taskPrefix, devMode, testing }) {
    const standardBundles = [
      'background',
      'ui',
      'phishing-detect',
    ]

    const standardSubtasks = standardBundles.map((filename) => {
      return createTask(`${taskPrefix}:${filename}`,
        createBundleTaskForBuildJsExtensionNormal({ filename, devMode, testing }))
    })
    // esbuild tree-shakes ESM dependencies, which matters most for the scripts
    // injected into every page (inpage, contentscript).
    for (const [name, entry, globalName] of [
      ['hardware', './app/scripts/hardware.js'],
      ['transaction-codec', './app/scripts/lib/transaction-codec-implementation.js', 'ecfWalletTransactionCodec'],
      ['modern-controllers', './app/scripts/lib/modern-controllers-implementation.js', 'ecfWalletModernControllers'],
      ['inpage', './app/scripts/inpage.js'],
      ['contentscript', './app/scripts/contentscript.js'],
    ]) {
      standardSubtasks.push(createTask(`${taskPrefix}:${name}`, async () => {
        const options = {
          entryPoints: [entry],
          outfile: `./dist/chrome/${name}.js`,
          globalName,
          ...browserOptions({ pageScript: name === 'inpage' || name === 'contentscript' }),
          minify: !devMode,
          // Pages may inspect the provider's class name.
          keepNames: name === 'inpage',
          sourcemap: true,
          define: {
            global: 'globalThis',
            'process.env.NODE_ENV': JSON.stringify(devMode ? 'development' : 'production'),
            'process.env.ECF_WALLET_DEBUG': JSON.stringify(Boolean(devMode)),
            'process.env.ECF_WALLET_ENVIRONMENT': JSON.stringify(getEnvironment({ devMode, test: testing })),
            'process.env.IN_TEST': JSON.stringify(testing ? 'true' : false),
          },
          write: false,
        }
        const writeBundle = async (result) => {
          const outputs = result.outputFiles.map((file) => ({ base: file.path.split('/').pop(), contents: file.contents }))
          // Like the Browserify bundles, production keeps source maps out of the
          // packaged extension, in dist/sourcemaps.
          const maps = devMode ? [] : outputs.filter(({ base }) => base.endsWith('.map'))
          const files = outputs.filter((file) => !maps.includes(file)).map((file) => (devMode || !file.base.endsWith('.js') ? file : {
            ...file,
            contents: Buffer.from(Buffer.from(file.contents).toString().replace(
              `//# sourceMappingURL=${file.base}.map`, `//# sourceMappingURL=../sourcemaps/${file.base}.map`,
            )),
          }))
          await fs.ensureDir('./dist/sourcemaps')
          await Promise.all(maps.map(({ base, contents }) => fs.writeFile(`./dist/sourcemaps/${base}`, contents)))
          await Promise.all(browserPlatforms.map(async (platform) => {
            await fs.ensureDir(`./dist/${platform}`)
            await Promise.all(files.map(({ base, contents }) => fs.writeFile(`./dist/${platform}/${base}`, contents)))
          }))
        }
        if (devMode) {
          options.plugins.push({
            name: `write-${name}-bundle`,
            setup: (build) => build.onEnd(async (result) => {
              if (!result.errors.length) {
                await writeBundle(result)
              }
            }),
          })
          const context = await esbuild.context(options)
          await context.watch()
        } else {
          await writeBundle(await esbuild.build(options))
        }
      }))
    }
    // task for initiating livereload
    const initiateLiveReload = async () => {
      if (devMode) {
        // trigger live reload when the bundles are updated
        // this is not ideal, but overcomes the limitations:
        // - run from the main process (not child process tasks)
        // - after the first build has completed (thus the timeout)
        // - build tasks never "complete" when run with livereload + child process
        setTimeout(() => {
          watch('./dist/*/*.js', (event) => {
            livereload.changed(event.path)
          })
        }, 75e3)
      }
    }

    // make each bundle run in a separate process
    const allSubtasks = standardSubtasks.map((subtask) => runInChildProcess(subtask))
    // make a parent task that runs each task in a child thread
    return composeParallel(initiateLiveReload, ...allSubtasks)
  }

  function createBundleTaskForBuildJsExtensionNormal ({ filename, devMode, testing }) {
    return bundleTask({
      label: filename,
      filename: `${filename}.js`,
      filepath: `./app/scripts/${filename}.js`,
      externalDependencies: devMode && filename !== 'background' ? undefined : externalDependenciesMap[filename],
      devMode,
      testing,
    })
  }

  function bundleTask (opts) {
    let bundler

    return performBundle

    async function performBundle () {
      // initialize bundler if not available yet
      // dont create bundler until task is actually run
      if (!bundler) {
        bundler = generateBundler(opts, performBundle)
        // output build logs to terminal
        bundler.on('log', log)
      }

      let buildStream = bundler.bundle()

      // handle errors
      buildStream.on('error', (err) => {
        beep()
        if (opts.devMode) {
          console.warn(err.stack)
        } else {
          throw err
        }
      })

      // process bundles
      buildStream = buildStream
        // convert bundle stream to gulp vinyl stream
        .pipe(source(opts.filename))
        // buffer file contents (?)
        .pipe(buffer())

      // Initialize Source Maps
      buildStream = buildStream
        // loads map from browserify file
        .pipe(sourcemaps.init({ loadMaps: true }))

      // Minification
      // The policy visualization needs the production dependency graph, but the
      // LavaMoat prelude cannot be parsed by this project's older Terser.
      if (!opts.devMode && !(process.env.SESIFY_AUTOGEN && opts.filename === 'background.js')) {
        buildStream = buildStream
          .pipe(terser({
            mangle: {
              reserved: ['MetamaskInpageProvider'],
            },
          }))
      }

      // Finalize Source Maps
      if (opts.devMode) {
        // Use inline source maps for development due to Chrome DevTools bug
        // https://bugs.chromium.org/p/chromium/issues/detail?id=931675
        buildStream = buildStream
          .pipe(sourcemaps.write())
      } else {
        buildStream = buildStream
          .pipe(sourcemaps.write('../sourcemaps'))
      }

      // write completed bundles
      browserPlatforms.forEach((platform) => {
        const dest = `./dist/${platform}`
        buildStream = buildStream.pipe(gulp.dest(dest))
      })

      await endOfStream(buildStream)
    }
  }

  function configureBundleForLavamoat ({ browserifyOpts }) {
    // add LavaMoat args for better globalRef usage detection
    Object.assign(browserifyOpts, lavamoat.args)

    // ensure browserify uses full paths
    browserifyOpts.fullPaths = true

    // add LavaMoat plugin and write policies for the dependency visualization
    browserifyOpts.plugin.push([lavamoat, {
      writeAutoPolicyDebug: true,
    }])

    // remove html comments that SES is allergic to
    const removeHtmlComment = makeStringTransform('remove-html-comment', { excludeExtension: ['.json'] }, (content, _, cb) => {
      const result = content.split('-->').join('-- >')
      cb(null, result)
    })
    browserifyOpts.transform.push([removeHtmlComment, { global: true }])
  }

  function generateBundler (opts, performBundle) {
    const browserifyOpts = assign({}, watchify.args, {
      plugin: [],
      transform: [],
      debug: true,
      fullPaths: opts.devMode,
    })

    const bundleName = opts.filename.split('.')[0]

    // activate LavaMoat for dependency policy generation
    const activateAutoConfig = Boolean(process.env.SESIFY_AUTOGEN)
    // const activateSesify = activateAutoConfig
    const activateSesify = activateAutoConfig && ['background'].includes(bundleName)
    if (activateSesify) {
      configureBundleForLavamoat({ browserifyOpts })
    }

    if (!activateSesify) {
      browserifyOpts.plugin.push('browserify-derequire')
    }

    if (!opts.buildLib) {
      browserifyOpts.entries = [opts.filepath]
    }

    let bundler = browserify(browserifyOpts)
      .transform('babelify')
      .transform('brfs')
      .transform(sesCompatibilityTransform, { global: true })

    if (opts.buildLib) {
      bundler = bundler.require(opts.dependenciesToBundle)
    }

    if (opts.externalDependencies) {
      bundler = bundler.external(opts.externalDependencies)
    }

    const environment = getEnvironment({ devMode: opts.devMode, test: opts.testing })
    // Inject variables into bundle
    bundler.transform(envify({
      ECF_WALLET_DEBUG: opts.devMode,
      ECF_WALLET_ENVIRONMENT: environment,
      NODE_ENV: opts.devMode ? 'development' : 'production',
      IN_TEST: opts.testing ? 'true' : false,
      CONF: opts.devMode ? conf : ({}),
    }), {
      global: true,
    })

    // Live reload - minimal rebundle on change
    if (opts.devMode) {
      bundler = watchify(bundler)
      // on any file update, re-runs the bundler
      bundler.on('update', () => {
        performBundle()
      })
    }

    return bundler
  }

}

function beep () {
  process.stdout.write('\x07')
}

function getEnvironment ({ devMode, test }) {
  // get environment slug
  if (devMode) {
    return 'development'
  } else if (test) {
    return 'testing'
  } else if (process.env.CIRCLE_BRANCH === 'master') {
    return 'production'
  } else if ((/^Version-v(\d+)[.](\d+)[.](\d+)/u).test(process.env.CIRCLE_BRANCH)) {
    return 'release-candidate'
  } else if (process.env.CIRCLE_BRANCH === 'develop') {
    return 'staging'
  } else if (process.env.CIRCLE_PULL_REQUEST) {
    return 'pull-request'
  }
  return 'other'
}
