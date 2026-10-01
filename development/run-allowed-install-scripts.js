#!/usr/bin/env node
// Dependencies are installed with lifecycle scripts disabled (see .yarnrc),
// because an install script runs arbitrary code with the developer's
// privileges. This runs the scripts of packages explicitly allowed in
// package.json "installScripts", and fails when a package with an install
// script has not been reviewed yet.
//
// Usage: node development/run-allowed-install-scripts.js [--list]
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STAGES = ['preinstall', 'install', 'postinstall']

function findPackages (dir, found = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (_) {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue
    }
    const packageDir = path.join(dir, entry.name)
    if (entry.name.startsWith('@')) {
      findPackages(packageDir, found)
      continue
    }
    const manifestPath = path.join(packageDir, 'package.json')
    if (fs.existsSync(manifestPath)) {
      found.push(packageDir)
      findPackages(path.join(packageDir, 'node_modules'), found)
    }
  }
  return found
}

function getInstallScripts (packageDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  const scripts = {}
  for (const stage of STAGES) {
    if (manifest.scripts?.[stage]) {
      scripts[stage] = manifest.scripts[stage]
    }
  }
  // npm and yarn build native addons implicitly when no install script is given.
  if (!scripts.install && !scripts.preinstall && fs.existsSync(path.join(packageDir, 'binding.gyp'))) {
    scripts.install = 'node-gyp rebuild'
  }
  return { name: manifest.name, scripts }
}

function main () {
  const { installScripts: policy = {} } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const withScripts = findPackages(path.join(ROOT, 'node_modules'))
    .map((dir) => ({ dir, ...getInstallScripts(dir) }))
    .filter(({ scripts }) => Object.keys(scripts).length > 0)

  if (process.argv.includes('--list')) {
    for (const { name, dir, scripts } of withScripts) {
      console.log(`${name} (${path.relative(ROOT, dir)}): ${JSON.stringify(scripts)} -> ${policy[name] ?? 'unreviewed'}`)
    }
    return
  }

  const unreviewed = withScripts.filter(({ name }) => typeof policy[name] !== 'boolean')
  if (unreviewed.length) {
    console.error('These packages have install scripts that have not been reviewed:')
    for (const { name, dir, scripts } of unreviewed) {
      console.error(`  ${name} (${path.relative(ROOT, dir)}): ${JSON.stringify(scripts)}`)
    }
    console.error('Review each script, then add the package to "installScripts" in package.json:')
    console.error('true to run its scripts, false to skip them.')
    process.exit(1)
  }

  for (const { name, dir, scripts } of withScripts) {
    if (!policy[name]) {
      continue
    }
    for (const stage of STAGES) {
      if (!scripts[stage]) {
        continue
      }
      console.log(`Running ${name} ${stage}: ${scripts[stage]}`)
      const result = spawnSync(scripts[stage], {
        cwd: dir,
        shell: true,
        stdio: 'inherit',
        env: { ...process.env, PATH: `${path.join(ROOT, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH}` },
      })
      if (result.status !== 0) {
        console.error(`${name} ${stage} failed`)
        process.exit(result.status || 1)
      }
    }
  }
}

main()
