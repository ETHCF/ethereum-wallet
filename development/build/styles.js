const gulp = require('gulp');
const autoprefixer = require('gulp-autoprefixer');
const rename = require('gulp-rename');
const rtlcss = require('gulp-rtlcss');
const sass = require('gulp-sass')(require('sass'));
const sourcemaps = require('gulp-sourcemaps');
const watch = require('gulp-watch');
const { promisify } = require('util');

const pump = promisify(require('pump'));
const { createTask } = require('./task');

// scss compilation and autoprefixing tasks
module.exports = createStyleTasks;

function createStyleTasks({ livereload }) {
  const prod = createTask(
    'styles:prod',
    createScssBuildTask({
      src: 'ui/app/css/index.scss',
      dest: 'ui/app/css/output',
      devMode: false,
    }),
  );

  const dev = createTask(
    'styles:dev',
    createScssBuildTask({
      src: 'ui/app/css/index.scss',
      dest: 'ui/app/css/output',
      devMode: true,
      pattern: 'ui/app/**/*.scss',
    }),
  );

  return { prod, dev };

  function createScssBuildTask({ src, dest, devMode, pattern }) {
    return async function () {
      if (devMode) {
        watch(pattern, async (event) => {
          await buildScss();
          livereload.changed(event.path);
        });
      }
      await buildScss(devMode);
    };

    async function buildScss() {
      await pump(
        ...[
          // pre-process
          gulp.src(src),
          devMode && sourcemaps.init(),
          sass().on('error', sass.logError),
          devMode && sourcemaps.write(),
          autoprefixer(),
          // standard
          gulp.dest(dest),
          // right-to-left
          rtlcss(),
          rename({ suffix: '-rtl' }),
          devMode && sourcemaps.write(),
          gulp.dest(dest),
        ].filter(Boolean),
      );
    }
  }
}
