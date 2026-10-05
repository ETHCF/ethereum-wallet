import babelParser from '@babel/eslint-parser';
import babelPlugin from '@babel/eslint-plugin';
import base, { createConfig } from '@metamask/eslint-config';
import browser from '@metamask/eslint-config-browser';
import mocha from '@metamask/eslint-config-mocha';
import nodejs from '@metamask/eslint-config-nodejs';
import jsonPlugin from 'eslint-plugin-json';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default createConfig([
  {
    ignores: [
      // ESLint 9 no longer skips dotfiles and dot directories, such as build
      // output in .out and the Anvil cache in .metamask.
      '**/.*',
      '**/.*/',
      'dist/**',
      'builds/**',
      'build-artifacts/**',
      'test-*/**',
      'docs/**',
      'coverage/**',
      'app/vendor/**',
      // Minified third-party bundles the e2e tests serve.
      'test/e2e/send-eth-with-private-key-test/ethereumjs-tx.js',
      'test/e2e/send-eth-with-private-key-test/web3js.js',
    ],
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [base],
    languageOptions: {
      parser: babelParser,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          impliedStrict: true,
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
      },
    },
    plugins: {
      '@babel': babelPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      'default-param-last': 'off',
      // Our class setters are write-only.
      'accessor-pairs': ['error', { enforceForClassMembers: false }],
      'require-atomic-updates': 'off',
      'prefer-object-spread': 'error',
      'prefer-destructuring': [
        'error',
        {
          VariableDeclarator: { array: false, object: true },
          AssignmentExpression: { array: false, object: false },
        },
        { enforceForRenamedProperties: false },
      ],
      // Catch parameters are often named for clarity and left unused.
      'no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'all',
          argsIgnorePattern: '[_]+',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],

      // Existing JSDoc comments are checked, but documenting every function
      // of this JavaScript codebase is not required.
      'jsdoc/require-jsdoc': 'off',

      // Naming and wording rules the existing code does not follow; adopting
      // them would mean renaming identifiers across most of the codebase
      // (err, msg, cb, the translation function t) and rewording its comments.
      'id-denylist': 'off',
      'id-length': 'off',
      'no-shadow': 'off',
      'jsdoc/match-description': 'off',

      'no-invalid-this': 'off',
      '@babel/no-invalid-this': 'error',

      // Webpack bundles browser versions of the Node modules the app uses,
      // such as events and assert.
      'import-x/no-nodejs-modules': 'off',
      'import-x/no-unassigned-import': 'off',
      // @noble/hashes only exports its modules with their .js extension.
      'import-x/extensions': [
        'error',
        'never',
        {
          pattern: { json: 'always' },
          pathGroupOverrides: [
            { pattern: '@noble/hashes/**', action: 'ignore' },
          ],
        },
      ],

      'react/no-unused-prop-types': 'error',
      'react/no-unused-state': 'error',
      'react/jsx-boolean-value': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],
      'react/no-deprecated': 'error',
      'react/default-props-match-prop-types': 'error',
      'react/jsx-no-duplicate-props': 'error',
    },
  },

  {
    files: ['app/**/*.js', 'ui/**/*.js'],
    extends: [browser],
    rules: {
      // Webpack provides these to the extension's bundles (see
      // development/build/webpack.config.js), and the migrations mix in require.
      'no-restricted-globals': [
        'error',
        '__dirname',
        '__filename',
        'clearImmediate',
        'exports',
        'module',
        'setImmediate',
      ],
    },
  },

  {
    files: [
      '*.js',
      '*.mjs',
      'development/**/*.js',
      'test/**/*.js',
      'ui/**/*.test.js',
      'ui/**/tests/**/*.js',
    ],
    extends: [nodejs],
    languageOptions: {
      // The Node config assumes CommonJS; most of these files are ES modules.
      // CommonJS files are listed further down.
      sourceType: 'module',
    },
    rules: {
      // Build scripts and tests: they read the environment, exit with a
      // status, use synchronous file access and require dev dependencies.
      'n/no-process-env': 'off',
      'n/no-process-exit': 'off',
      'n/no-sync': 'off',
      'n/no-unpublished-require': 'off',
      'n/no-unpublished-import': 'off',
      'n/hashbang': 'off',
    },
  },

  {
    // Tests run in Node with a simulated browser (jsdom).
    files: ['test/**/*.js', 'ui/**/*.test.js', 'ui/**/tests/**/*.js'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  {
    files: ['test/**/*.js', 'ui/app/**/*.test.js'],
    extends: [mocha],
    rules: {
      'mocha/no-setup-in-describe': 'off',
      // Sinon exposes the same methods on its CommonJS default and named exports.
      'import-x/no-named-as-default-member': 'off',
    },
  },

  {
    files: ['test/e2e/**/*.js'],
    rules: {
      'mocha/no-hooks-for-single-case': 'off',
    },
  },

  {
    files: ['app/scripts/migrations/*.js'],
    rules: {
      'import-x/no-anonymous-default-export': ['error', { allowObject: true }],
      'global-require': 'off',
    },
  },

  {
    files: ['test/**/*-test.js', 'test/**/*.spec.js'],
    rules: {
      // Mocha will re-assign `this` in a test context
      '@babel/no-invalid-this': 'off',
    },
  },

  {
    files: ['development/**/*.js', 'test/e2e/benchmark.js', 'test/helper.js'],
    rules: {
      'no-process-exit': 'off',
    },
  },

  {
    files: [
      'babel.config.js',
      'nyc.config.js',
      'stylelint.config.js',
      'development/**/*.js',
      'test/e2e/**/*.js',
      'test/anvil.js',
      'test/env.js',
      'test/setup.js',
    ],
    // CommonJS: top-level declarations are local to the module.
    languageOptions: {
      sourceType: 'script',
      parserOptions: {
        ecmaFeatures: {
          globalReturn: true,
        },
      },
    },
  },

  {
    ...jsonPlugin.configs.recommended,
    files: ['**/*.json'],
  },
]);
