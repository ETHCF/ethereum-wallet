module.exports = function (api) {
  api.cache(false);
  return {
    presets: [
      [
        '@babel/preset-env',
        {
          targets: {
            // The manifest minimums (development/build/manifest.js, app/manifest/firefox.json).
            browsers: ['chrome >= 120', 'firefox >= 128'],
          },
        },
      ],
      '@babel/preset-react',
    ],
    // Class fields, object rest/spread, optional chaining and nullish
    // coalescing are standard now; preset-env compiles them for the targets.
    plugins: ['@babel/plugin-transform-runtime'],
  };
};
