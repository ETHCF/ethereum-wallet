module.exports = function (api) {
  api.cache(false)
  return {
    presets: [
      [
        '@babel/preset-env',
        {
          targets: {
            browsers: [
              'chrome >= 58',
              'firefox >= 56.2',
            ],
          },
        },
      ],
      '@babel/preset-react',
    ],
    // Class fields, object rest/spread, optional chaining and nullish
    // coalescing are standard now; preset-env compiles them for the targets.
    plugins: [
      '@babel/plugin-transform-runtime',
    ],
  }
}
