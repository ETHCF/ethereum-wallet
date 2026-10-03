#!/usr/bin/env node
// Recomputes the hash a built extension reports under Settings > About, so a
// build can be checked against a checkout of the source it claims to come from.
//
// Usage: node development/verify-build.js [dist/chrome]
//
// To verify a release end to end:
//   git checkout <the commit the wallet reports>
//   yarn setup && yarn dist
//   node development/verify-build.js dist/chrome
// and compare the hash with the one the installed wallet shows.
const { promises: fs } = require('fs')
const path = require('path')
const { hashBuild, OUTPUT_FILE } = require('./build/build-info')

async function main () {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'chrome'))

  let reported
  try {
    reported = JSON.parse(await fs.readFile(path.join(dir, OUTPUT_FILE), 'utf8'))
  } catch (_) {
    console.error(`No ${OUTPUT_FILE} in ${dir}. Build it first with "yarn dist".`)
    process.exit(1)
  }

  const actual = await hashBuild(dir)
  console.log(`commit:   ${reported.commit}`)
  console.log(`reported: ${reported.hash}`)
  console.log(`actual:   ${actual}`)

  if (actual !== reported.hash) {
    console.error('MISMATCH: the files do not hash to the value the build reports.')
    process.exit(1)
  }
  console.log('OK: the build matches the hash it reports.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
