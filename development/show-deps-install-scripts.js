// This script lists all dependencies that have package install scripts
const fs = require('fs')
const path = require('path')

const installScripts = ['preinstall', 'install', 'postinstall']
const nodeModules = path.resolve('node_modules')

// Every package installed at the top level of node_modules, including scoped ones.
function listPackages () {
  return fs.readdirSync(nodeModules)
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) => (name.startsWith('@')
      ? fs.readdirSync(path.join(nodeModules, name)).map((scoped) => `${name}/${scoped}`)
      : [name]))
}

for (const packageName of listPackages()) {
  const packagePath = path.join(nodeModules, packageName)
  let packageJson
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'))
  } catch (_) {
    continue
  }
  const packageScripts = packageJson.scripts || {}
  const scriptNames = installScripts.filter((name) => packageScripts[name])
  if (scriptNames.length > 0) {
    console.log(`${packageName}: ${path.relative(process.cwd(), packagePath)} ${scriptNames}`)
  }
}
