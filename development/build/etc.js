const { createWriteStream, promises: fs } = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');

const { writeBuildInfo, listFiles } = require('./build-info');
const { createTask, composeParallel } = require('./task');
const baseManifest = require('../../app/manifest/_base.json');

module.exports = createEtcTasks;

function createEtcTasks({ browserPlatforms, livereload }) {
  const clean = createTask('clean', async function clean() {
    await fs.rm('./dist', { recursive: true, force: true });
    await Promise.all(
      browserPlatforms.map(async (platform) => {
        await fs.mkdir(`./dist/${platform}`, { recursive: true });
      }),
    );
  });

  const reload = createTask('reload', function devReload() {
    livereload.listen({ port: 35729 });
  });

  // zip tasks for distribution
  const zip = createTask(
    'zip',
    composeParallel(
      ...browserPlatforms.map((platform) => createZipTask(platform)),
    ),
  );

  // Record what was built, so the wallet can show a hash anyone can recompute.
  const buildInfo = createTask('buildInfo', async function buildInfo() {
    await writeBuildInfo({ browserPlatforms });
  });

  return { clean, reload, zip, buildInfo };
}

// Every entry gets the same timestamp and mode, entries are sorted, and
// directories are implied by file paths. The zip then depends only on the
// file contents, so rebuilding the same commit gives a byte-identical package.
// The date is built from local-time fields and written as a plain DOS
// timestamp (no extended UTC field), so it reads 2026-11-05 00:00 in every
// time zone.
const ZIP_MTIME = new Date(2026, 10, 5); // month is 0-based: November
const ZIP_FILE_MODE = 0o100644;

function createZipTask(target) {
  return async () => {
    const dir = path.join('dist', target);
    // Compare as strings, not with localeCompare, so the order does not
    // depend on the locale.
    const files = (await listFiles(dir)).sort((a, b) =>
      a < b ? -1 : Number(a > b),
    );

    const zip = new yazl.ZipFile();
    for (const file of files) {
      zip.addBuffer(
        await fs.readFile(path.join(dir, ...file.split('/'))),
        file,
        { mtime: ZIP_MTIME, mode: ZIP_FILE_MODE, forceDosTimestamp: true },
      );
    }
    zip.end();

    await fs.mkdir('builds', { recursive: true });
    await pipeline(
      zip.outputStream,
      createWriteStream(
        path.join('builds', `ecf-wallet-${target}-${baseManifest.version}.zip`),
      ),
    );
  };
}
