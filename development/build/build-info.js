const { execSync } = require('child_process');
const crypto = require('crypto');
const { promises: fs, readFileSync } = require('fs');
const path = require('path');

// Written into each built extension, read by the UI and by verify-build.js.
const OUTPUT_FILE = 'build-info.json';

module.exports = { writeBuildInfo, hashBuild, OUTPUT_FILE };

async function writeBuildInfo({ browserPlatforms }) {
  const commit = getCommit();
  await Promise.all(
    browserPlatforms.map(async (platform) => {
      const dir = path.join('dist', platform);
      const hash = await hashBuild(dir);
      await fs.writeFile(
        path.join(dir, OUTPUT_FILE),
        `${JSON.stringify({ commit, hash }, null, 2)}\n`,
      );
    }),
  );
}

// Hashes every file in the build except OUTPUT_FILE. Paths are sorted and
// posix style so the result does not depend on the platform or file order.
async function hashBuild(dir) {
  const files = (await listFiles(dir))
    .filter((file) => file !== OUTPUT_FILE)
    .sort();

  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const contents = await fs.readFile(path.join(dir, ...file.split('/')));
    const fileHash = crypto.createHash('sha256').update(contents).digest('hex');
    hash.update(`${file}\0${fileHash}\n`);
  }
  return hash.digest('hex');
}

async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(path.join(dir, prefix), {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.map((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(dir, relative) : [relative];
    }),
  );
  return nested.flat();
}

// A source archive from `yarn source-package` has no .git directory, so it
// carries the commit in BUILD_COMMIT. Building from it then produces the same
// build-info.json as building from the repository. The file is checked first
// so an archive extracted inside an unrelated git checkout still reports its
// own commit.
const COMMIT_FILE = path.resolve(__dirname, '../../BUILD_COMMIT');

function getCommit() {
  try {
    return readFileSync(COMMIT_FILE, 'utf8').trim();
  } catch (_) {
    // not a source archive; ask git
  }
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return 'unknown';
  }
}
