#!/usr/bin/env node
// Packages the source code for store review (Mozilla Add-ons requires it for
// minified or bundled code). The archive is `git archive HEAD` plus a
// BUILD_COMMIT file, so a reviewer building it without git gets the same
// build-info.json as the published build. See "Rebuilding from the source
// archive" in README.md.
//
// Usage: yarn source-package
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { version } = require('../app/manifest/_base.json');

const ROOT = path.resolve(__dirname, '..');

function git(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' });
}

// The archive holds committed files only, so uncommitted changes would make
// the published build differ from what the reviewer rebuilds.
const dirty = git('status', '--porcelain', '--untracked-files=no').trimEnd();
if (dirty) {
  console.error(
    `Commit or stash these changes before packaging the source:\n${dirty}`,
  );
  process.exit(1);
}

const commit = git('rev-parse', 'HEAD').trim();
const output = path.join(ROOT, 'builds', `ecf-wallet-source-${version}.zip`);
fs.mkdirSync(path.dirname(output), { recursive: true });

// Not part of the extension build: an e2e test dapp that serves prebuilt,
// minified copies of web3 and ethereumjs-tx. Store review asks for the
// add-on's sources, and leaving these out keeps the archive free of
// machine-generated code.
const EXCLUDED = ['test/e2e/send-eth-with-private-key-test'];

git(
  'archive',
  '--format=zip',
  `--add-virtual-file=BUILD_COMMIT:${commit}\n`,
  `--output=${output}`,
  'HEAD',
  '--',
  '.',
  ...EXCLUDED.map((dir) => `:(exclude)${dir}`),
);

console.log(`Wrote ${path.relative(ROOT, output)} (commit ${commit})`);
