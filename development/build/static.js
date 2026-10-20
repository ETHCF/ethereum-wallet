const glob = require('fast-glob');
const fs = require('fs-extra');
const gulp = require('gulp');
const path = require('path');

const { createTask, composeSeries } = require('./task');

module.exports = createStaticAssetTasks;

const copyTargets = [
  {
    src: './app/',
    pattern: 'service-worker.js',
    dest: '',
  },
  {
    // SES: lockdown must not be bundled or minified. The only change is
    // permitting known intrinsics as `false` (removed without a warning).
    src: './node_modules/ses/dist/lockdown.umd.min.js',
    dest: 'lockdown-install.js',
    transform: excludeKnownIntrinsics,
  },
  {
    src: `./app/_locales/`,
    dest: `_locales`,
  },
  {
    src: `./app/images/`,
    dest: `images`,
  },
  {
    src: `./node_modules/@metamask/contract-metadata/images/`,
    dest: `images/contract`,
  },
  {
    src: `./ui/app/css/output/`,
    pattern: `*.css`,
    dest: ``,
  },
  {
    src: `./app/`,
    pattern: `*.html`,
    dest: ``,
  },
  {
    src: './node_modules/@trezor/connect-web/lib/webextension/trezor-content-script.js',
    dest: 'vendor/trezor/content-script.js',
  },
  {
    src: './node_modules/@trezor/connect-web/lib/webextension/trezor-usb-permissions.js',
    dest: 'vendor/trezor/usb-permissions.js',
  },
];

// Chrome ships proposal methods that SES has not audited yet. SES removes them
// either way, but warns unless the permit is `false`, and the extension Errors
// page reports those warnings. Each entry must match exactly once so a SES
// upgrade that changes the permits fails the build instead of being skipped.
const KNOWN_EXCLUDED_INTRINSICS = [
  {
    // %IteratorPrototype%.join (https://github.com/tc39/proposal-iterator-join)
    find: 'toAsync:fn,"@@dispose":!1}',
    replace: 'toAsync:fn,join:!1,"@@dispose":!1}',
  },
];

function excludeKnownIntrinsics(source) {
  return KNOWN_EXCLUDED_INTRINSICS.reduce((result, { find, replace }) => {
    const count = result.split(find).length - 1;
    if (count !== 1) {
      throw new Error(
        `SES permit patch expected 1 match for ${find}, found ${count}`,
      );
    }
    return result.replace(find, replace);
  }, source);
}

function createStaticAssetTasks({ livereload, browserPlatforms }) {
  const prod = createTask('static:prod', copyEachTarget(performCopy));
  const dev = createTask('static:dev', copyEachTarget(setupLiveCopy));

  return { dev, prod };

  function copyEachTarget(copy) {
    return composeSeries(
      ...copyTargets.map((target) => {
        return async function copyStaticAssets() {
          await copy(target);
        };
      }),
    );
  }

  async function setupLiveCopy(target) {
    const pattern = target.pattern || '/**/*';
    gulp.watch(target.src + pattern).on('all', (_event, changedPath) => {
      livereload.changed(changedPath);
      performCopy(target);
    });
    await performCopy(target);
  }

  async function performCopy(target) {
    await Promise.all(
      browserPlatforms.map(async (platform) => {
        if (target.transform) {
          const source = await fs.readFile(target.src, 'utf8');
          await fs.outputFile(
            `./dist/${platform}/${target.dest}`,
            target.transform(source),
          );
          return;
        }
        await copyGlob(
          target.src,
          `${target.src}${target.pattern || ''}`,
          `./dist/${platform}/${target.dest}`,
        );
      }),
    );
  }

  async function copyGlob(baseDir, srcGlob, dest) {
    const sources = await glob(srcGlob, { onlyFiles: false });
    await Promise.all(
      sources.map(async (src) => {
        const relativePath = path.relative(baseDir, src);
        await fs.copy(src, `${dest}${relativePath}`);
      }),
    );
  }
}
