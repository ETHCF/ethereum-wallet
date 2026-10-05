const glob = require('fast-glob');
const fs = require('fs-extra');
const watch = require('gulp-watch');
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
    // SES, copied unchanged: lockdown must not be bundled or minified.
    src: './node_modules/ses/dist/lockdown.umd.min.js',
    dest: 'lockdown-install.js',
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
    src: `./app/fonts/`,
    dest: `fonts`,
  },
  {
    src: `./app/vendor/`,
    dest: `vendor`,
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

const copyTargetsDev = [...copyTargets];

function createStaticAssetTasks({ livereload, browserPlatforms }) {
  const prod = createTask(
    'static:prod',
    composeSeries(
      ...copyTargets.map((target) => {
        return async function copyStaticAssets() {
          await performCopy(target);
        };
      }),
    ),
  );
  const dev = createTask(
    'static:dev',
    composeSeries(
      ...copyTargetsDev.map((target) => {
        return async function copyStaticAssets() {
          await setupLiveCopy(target);
        };
      }),
    ),
  );

  return { dev, prod };

  async function setupLiveCopy(target) {
    const pattern = target.pattern || '/**/*';
    watch(target.src + pattern, (event) => {
      livereload.changed(event.path);
      performCopy(target);
    });
    await performCopy(target);
  }

  async function performCopy(target) {
    await Promise.all(
      browserPlatforms.map(async (platform) => {
        if (target.pattern) {
          await copyGlob(
            target.src,
            `${target.src}${target.pattern}`,
            `./dist/${platform}/${target.dest}`,
          );
        } else {
          await copyGlob(
            target.src,
            `${target.src}`,
            `./dist/${platform}/${target.dest}`,
          );
        }
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
