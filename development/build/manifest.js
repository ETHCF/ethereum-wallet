const { promises: fs } = require('fs');
const { merge, cloneDeep } = require('lodash');
const path = require('path');

const { createTask } = require('./task');
const baseManifest = require('../../app/manifest/_base.json');

module.exports = createManifestTasks;

function createManifestTasks({ browserPlatforms }) {
  // merge base manifest with per-platform manifests
  const prepPlatforms = async () => {
    return Promise.all(
      browserPlatforms.map(async (platform) => {
        const platformModifications = await readJson(
          path.join(__dirname, '../../app/manifest', `${platform}.json`),
        );
        const result = merge(cloneDeep(baseManifest), platformModifications);
        if (platform === 'firefox') {
          result.background = {
            scripts: ['lockdown-install.js', 'background.js'],
          };
          // Lets the wallet check that a site's icon does not resolve to
          // this computer before downloading it. Added here because merge()
          // would overwrite the base list by index.
          result.permissions = [...result.permissions, 'dns'];
        } else {
          result.minimum_chrome_version = '120';
        }
        const dir = `./dist/${platform}`;
        await fs.mkdir(dir, { recursive: true });
        await writeJson(result, `${dir}/manifest.json`);
      }),
    );
  };

  // high level manifest tasks
  const dev = createTask('manifest:dev', prepPlatforms);
  const testDev = createTask('manifest:testDev', prepPlatforms);
  const test = createTask('manifest:test', prepPlatforms);
  const prod = createTask('manifest:prod', prepPlatforms);

  return { prod, dev, testDev, test };
}

// helper for reading and deserializing json from fs
async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

// helper for serializing and writing json to fs
async function writeJson(obj, path) {
  return fs.writeFile(path, JSON.stringify(obj, null, 2));
}
