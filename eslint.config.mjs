import base, { createConfig } from '@metamask/eslint-config';
import mocha from '@metamask/eslint-config-mocha';
import babelParser from '@babel/eslint-parser';
import babelPlugin from '@babel/eslint-plugin';
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
