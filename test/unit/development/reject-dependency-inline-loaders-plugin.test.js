import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import webpack from 'webpack';

import RejectDependencyInlineLoadersPlugin from '../../../development/build/reject-dependency-inline-loaders-plugin';

const LOADER = `
module.exports = function (source) {
  require('fs').writeFileSync(require('path').join(__dirname, 'LOADER_RAN'), '');
  return source;
};
`;

describe('RejectDependencyInlineLoadersPlugin', function () {
  this.timeout(30000);

  let root;
  let loaderRan;

  const write = (file, source) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  };

  const build = (plugins) =>
    new Promise((resolve, reject) => {
      webpack(
        {
          mode: 'none',
          context: root,
          entry: './src/index.js',
          output: { path: path.join(root, 'dist') },
          plugins,
        },
        (error, stats) => (error ? reject(error) : resolve(stats)),
      );
    });

  const withDependency = (source) => {
    write('src/index.js', `require('dep');`);
    write('node_modules/dep/package.json', '{"name":"dep","main":"index.js"}');
    write('node_modules/dep/index.js', source);
    write('node_modules/dep/loader.js', LOADER);
    write('node_modules/dep/file.js', 'module.exports = 1;');
    write('node_modules/dep/files/file.js', 'module.exports = 1;');
  };

  beforeEach(function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-loaders-'));
    loaderRan = path.join(root, 'node_modules/dep/LOADER_RAN');
  });

  afterEach(function () {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const inlineRequests = {
    require: `require('!!./loader.js!./file.js');`,
    'loader-prefix': `require('-!./loader.js!./file.js');`,
    'import()': `import('!!./loader.js!./file.js');`,
    'new URL': `new URL('!!./loader.js!./file.js', import.meta.url);`,
    'require.context': `require.context('!!./loader.js!./files', false, /\\.js$/);`,
  };

  Object.entries(inlineRequests).forEach(([name, source]) => {
    it(`fails the build and runs no loader for ${name}`, async function () {
      withDependency(source);

      const stats = await build([new RejectDependencyInlineLoadersPlugin()]);

      assert(stats.hasErrors());
      assert(!fs.existsSync(loaderRan));
    });
  });

  it('would run the loader without the plugin', async function () {
    withDependency(inlineRequests.require);

    await build([]);

    assert(fs.existsSync(loaderRan));
  });

  it('allows ordinary dependency requests', async function () {
    withDependency(`require('./file.js');`);

    const stats = await build([new RejectDependencyInlineLoadersPlugin()]);

    assert(!stats.hasErrors());
  });

  it('allows inline loaders in first-party code', async function () {
    write('src/index.js', `require('!!./loader.js!./file.js');`);
    write('src/loader.js', LOADER);
    write('src/file.js', 'module.exports = 1;');

    const stats = await build([new RejectDependencyInlineLoadersPlugin()]);

    assert(!stats.hasErrors());
  });
});
