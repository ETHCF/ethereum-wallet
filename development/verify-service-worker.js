#!/usr/bin/env node
// Loads a built extension's service worker scripts in order, as Chrome's
// importScripts does, and fails if any throws while loading. Chrome reports
// that as "Service worker registration failed. Status code: 15". The e2e tests
// use test builds, which skip some production-only startup code.
//
// Usage: node development/verify-service-worker.js [dist/chrome]
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'chrome'))

// Every extension API is a callable stub: only top-level evaluation is checked.
const stub = () => new Proxy(function () {
  return undefined
}, {
  get: (_, key) => (key === 'then' ? undefined : stub()),
  apply: () => stub(),
})

globalThis.self = globalThis
globalThis.chrome = stub()
let loaded = 0
globalThis.importScripts = (...files) => {
  for (const file of files) {
    vm.runInThisContext(fs.readFileSync(path.join(dir, file), 'utf8'), { filename: file })
    loaded += 1
  }
}
// Initialization continues asynchronously against the stubs; only the
// synchronous evaluation of each script matters here.
process.on('unhandledRejection', () => undefined)

try {
  vm.runInThisContext(fs.readFileSync(path.join(dir, 'service-worker.js'), 'utf8'), { filename: 'service-worker.js' })
} catch (error) {
  console.error(`Service worker failed while loading (after ${loaded} scripts): ${error.name}: ${error.message}`)
  console.error(String(error.stack).split('\n').filter((line) => line.trim().startsWith('at ')).slice(0, 5).join('\n'))
  process.exit(1)
}
console.log(`Service worker loaded ${loaded} scripts from ${dir}`)
process.exit(0)
