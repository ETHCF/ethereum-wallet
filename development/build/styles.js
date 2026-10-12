const gulp = require('gulp');
const autoprefixer = require('gulp-autoprefixer').default;
const rename = require('gulp-rename');
const rtlcss = require('gulp-rtlcss');
const sass = require('gulp-sass')(require('sass'));
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
        gulp.watch(pattern).on('all', async (_event, changedPath) => {
          await buildScss();
          livereload.changed(changedPath);
        });
      }
      await buildScss();
    };

    async function buildScss() {
      await pump(
        ...[
          // pre-process; in development, gulp keeps an inline source map
          gulp.src(src, { sourcemaps: devMode }),
          sass({ loadPaths: ['ui/app/css'] }).on('error', sass.logError),
          autoprefixer(),
          // standard
          gulp.dest(dest, { sourcemaps: devMode }),
          // right-to-left
          rtlcss(),
          rename({ suffix: '-rtl' }),
          gulp.dest(dest, { sourcemaps: devMode }),
        ],
      );
    }
  }
}
