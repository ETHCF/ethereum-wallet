const { LavaMoatPlugin } = require('@lavamoat/webpack');
const fs = require('fs');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

const lockdownOptions = require('./lockdown-options');

const rootDir = path.resolve(__dirname, '../..');
const lockdownMore = path.join(rootDir, 'app/scripts/lockdown-more.js');

/**
 * Locate the readable-stream 3 copy that `@metamask/post-message-stream` uses.
 *
 * @returns {string} The browser entry of the readable-stream 3 copy that Yarn
 * nests under the `@metamask` packages
 */
function readableStreamBrowserEntry() {
  const fromPackage = path.dirname(
    require.resolve('@metamask/post-message-stream'),
  );
  const { version } = JSON.parse(
    fs.readFileSync(
      require.resolve('readable-stream/package.json', { paths: [fromPackage] }),
      'utf8',
    ),
  );
  if (!version.startsWith('3.')) {
    throw new Error(
      `Expected readable-stream 3 for @metamask packages, found ${version}`,
    );
  }
  return require.resolve('readable-stream/readable-browser.js', {
    paths: [fromPackage],
  });
}

// Browserify supplied these Node modules to every bundle; webpack needs them
// listed. Like Browserify, give server-only modules an empty stand-in: the
// packages that load them (dnode, native addons with JS fallbacks) only use
// them in Node or inside a try.
const nodeFallbacks = {
  assert: require.resolve('assert/'),
  buffer: require.resolve('buffer/'),
  child_process: false,
  crypto: require.resolve('crypto-browserify'),
  events: require.resolve('events/'),
  fs: false,
  http: false,
  https: false,
  net: false,
  os: false,
  path: false,
  punycode: require.resolve('punycode/'),
  querystring: require.resolve('querystring-es3'),
  stream: require.resolve('stream-browserify'),
  string_decoder: require.resolve('string_decoder/'),
  tls: false,
  url: require.resolve('url/'),
  util: require.resolve('util/'),
  vm: false,
  zlib: false,
};

/**
 * Webpack configurations for the extension's scripts. The extension bundles
 * load in the service worker and extension pages; the page scripts are
 * injected into every website, so they stay small and need no crypto.
 *
 * Every bundle except inpage.js, which runs inside websites, is locked down
 * and, with LavaMoat, runs each dependency in its own compartment, limited to
 * what lavamoat/webpack/<compiler>/policy.json allows it.
 *
 * @param {object} opts - Build options.
 * @param {boolean} opts.devMode - Unminified, inline source maps
 * @param {boolean} opts.testing - Built for the e2e tests
 * @param {boolean} [opts.lavamoat] - Sandbox dependencies with LavaMoat. It
 * cannot rebuild incrementally, so development builds run without it.
 * @param {boolean} [opts.generatePolicy] - Write LavaMoat policies instead of
 * bundles
 * @param {object} [opts.conf] - Development settings read from .ecf-walletrc
 * @returns {object[]} The webpack configurations
 */
module.exports = function createWebpackConfigs({
  devMode,
  testing,
  lavamoat = false,
  generatePolicy = false,
  conf = {},
}) {
  // The e2e tests drive extension pages with WebDriver's executeScript, which
  // evaluates its scripts through the page's Function constructor.
  const lockdown = testing
    ? { ...lockdownOptions, evalTaming: 'unsafe-eval' }
    : lockdownOptions;
  // Runs first in each sandboxed bundle. LavaMoat locks down before any module
  // runs; without it, lockdown-dev.js does.
  const sandboxed = (entry) => [
    ...(lavamoat ? [] : ['./app/scripts/lockdown-dev.js']),
    lockdownMore,
    entry,
  ];
  const lavamoatPlugin = (name) =>
    new LavaMoatPlugin({
      rootDir,
      // Relative to the working directory, which the build scripts set to rootDir.
      policyLocation: path.join('lavamoat', 'webpack', name),
      generatePolicyOnly: generatePolicy,
      lockdown,
      readableResourceIds: true,
      runChecks: true,
    });

  const shared = {
    mode: devMode ? 'development' : 'production',
    context: rootDir,
    target: ['web', 'es2022'],
    // Production keeps source maps out of the packaged extension, in dist/sourcemaps.
    devtool: devMode ? 'inline-source-map' : 'source-map',
    output: {
      path: path.join(rootDir, 'dist/chrome'),
      filename: '[name].js',
      sourceMapFilename: '../sourcemaps/[file].map',
      // Every entry is loaded on its own by a script tag, importScripts or the
      // manifest, so nothing may be split into chunks.
      chunkLoading: false,
      wasmLoading: false,
    },
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },
    performance: { hints: false },
    // A browser global, as Browserify provided: self in the service worker and
    // window in pages.
    node: { global: true },
    module: {
      rules: [
        {
          test: /\.js$/u,
          include: [path.join(rootDir, 'app'), path.join(rootDir, 'ui')],
          use: { loader: 'babel-loader', options: { cacheDirectory: devMode } },
        },
        { test: /\.svg$/u, type: 'asset/source' },
        {
          // It runs on the real global object once lockdown has finished, to
          // freeze the intrinsics LavaMoat's compartments are built from.
          test: lockdownMore,
          use: LavaMoatPlugin.exclude,
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          devMode ? 'development' : 'production',
        ),
        'process.env.ECF_WALLET_DEBUG': JSON.stringify(Boolean(devMode)),
        'process.env.IN_TEST': JSON.stringify(testing ? 'true' : false),
        'process.env.CONF': JSON.stringify(devMode ? conf : {}),
        'process.env.LOCKDOWN_OPTIONS': JSON.stringify(lockdown),
      }),
    ],
    stats: 'errors-warnings',
    // LavaMoat lists the empty stand-ins webpack builds for Node modules a
    // package does not use in browsers (fs, crypto, ... set to false); they
    // hold no code, so there is nothing for a policy to control.
    ignoreWarnings: [/the following module ids can't be controlled by policy/u],
  };

  const extension = {
    ...shared,
    name: 'extension',
    entry: {
      background: sandboxed('./app/scripts/background.js'),
      ui: sandboxed('./app/scripts/ui.js'),
      'phishing-detect': sandboxed('./app/scripts/phishing-detect.js'),
      hardware: sandboxed('./app/scripts/hardware.js'),
      'offscreen-clipboard': sandboxed('./app/scripts/offscreen-clipboard.js'),
    },
    resolve: {
      alias: {
        // dnode names its browser build in the "browserify" field, which only
        // Browserify reads; its Node build loads the native weak module.
        dnode$: require.resolve('dnode/browser.js'),
      },
      fallback: nodeFallbacks,
    },
    plugins: [
      ...shared.plugins,
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js',
      }),
      ...(lavamoat ? [lavamoatPlugin('extension')] : []),
    ],
  };

  const pageScripts = {
    ...shared,
    resolve: {
      // The @metamask packages here use readable-stream 3, nested under each of
      // them, while the wallet's own code uses the hoisted version 4. Bundle one
      // copy of version 3 for all of them; the wallet's streams work the same
      // on either version.
      alias: {
        'readable-stream$': readableStreamBrowserEntry(),
        stream$: readableStreamBrowserEntry(),
      },
      fallback: { ...nodeFallbacks, assert: false, crypto: false },
    },
    module: {
      rules: [
        ...shared.module.rules,
        {
          test: /[\\/]@metamask[\\/]providers[\\/]dist[\\/](?:messages|BaseProvider|StreamProvider|utils)\.[cm]?js$/u,
          use: path.join(__dirname, 'rebrand-provider-messages-loader.js'),
        },
      ],
    },
    plugins: [
      ...shared.plugins,
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js',
      }),
    ],
    optimization: {
      ...shared.optimization,
      minimizer: [
        new TerserPlugin({
          // Pages may inspect the provider's class name.
          terserOptions: { keep_classnames: true, keep_fnames: true },
        }),
      ],
    },
  };

  // The content script runs in the extension's isolated world, so it is
  // sandboxed like the extension bundles.
  const contentScript = {
    ...pageScripts,
    name: 'contentscript',
    entry: { contentscript: sandboxed('./app/scripts/contentscript.js') },
    plugins: [
      ...pageScripts.plugins,
      ...(lavamoat ? [lavamoatPlugin('contentscript')] : []),
    ],
  };

  // inpage.js runs inside websites, alongside their own code, so it is neither
  // locked down nor sandboxed: either would break the pages it is injected into.
  const inpage = {
    ...pageScripts,
    name: 'inpage',
    entry: { inpage: './app/scripts/inpage.js' },
  };

  return [extension, contentScript, inpage];
};
