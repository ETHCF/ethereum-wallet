const { promises: fs } = require('fs');
const { merge, cloneDeep } = require('lodash');
const path = require('path');

const { createTask } = require('./task');
const baseManifest = require('../../app/manifest/_base.json');
const chromiumDevKey = require('../../app/manifest/_chromium-dev-key.json');

module.exports = createManifestTasks;

function createManifestTasks({ browserPlatforms }) {
  // merge base manifest with per-platform manifests
  const prepPlatforms = async ({ pinChromiumId }) => {
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
          // Lets the wallet check that a host it was given (a site's icon, an
          // NFT image, an offchain ENS gateway) does not resolve to this
          // computer or the local network before contacting it. Added here
          // because merge() would overwrite the base list by index.
          result.permissions = [
            ...result.permissions.filter(
              (permission) => permission !== 'offscreen',
            ),
            'dns',
          ];
        } else {
          result.minimum_chrome_version = '120';
          // Gives unpacked builds the Chrome Web Store ID, so they keep the
          // same storage wherever they are loaded from. The store does not
          // accept a key, so prod builds go without one.
          if (pinChromiumId) {
            result.key = chromiumDevKey.key;
          }
        }
        const dir = `./dist/${platform}`;
        await fs.mkdir(dir, { recursive: true });
        await writeJson(result, `${dir}/manifest.json`);
      }),
    );
  };

  // high level manifest tasks
  const pinned = () => prepPlatforms({ pinChromiumId: true });
  const dev = createTask('manifest:dev', pinned);
  const testDev = createTask('manifest:testDev', pinned);
  const test = createTask('manifest:test', pinned);
  const prod = createTask('manifest:prod', () =>
    prepPlatforms({ pinChromiumId: false }),
  );

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
