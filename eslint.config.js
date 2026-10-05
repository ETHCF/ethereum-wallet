const globals = require('globals')
const babelParser = require('@babel/eslint-parser')
const babelPlugin = require('@babel/eslint-plugin')
const importPlugin = require('eslint-plugin-import')
const jsonPlugin = require('eslint-plugin-json')
const mochaPlugin = require('eslint-plugin-mocha')
const reactPlugin = require('eslint-plugin-react')
const reactHooksPlugin = require('eslint-plugin-react-hooks')
const metamaskConfig = require('@metamask/eslint-config')
const metamaskMochaConfig = require('@metamask/eslint-config/config/mocha')

// ESLint 9 removed these rules, which @metamask/eslint-config turns off.
const REMOVED_RULES = new Set(['require-jsdoc', 'valid-jsdoc'])
const metamaskRules = Object.fromEntries(
  Object.entries(metamaskConfig.rules).filter(([name]) => !REMOVED_RULES.has(name)),
)

module.exports = [
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
    files: ['**/*.js'],
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
        ...globals.es2021,
        ...globals['shared-node-browser'],
        ...globals.node,
        ...globals.mocha,
        '$': 'readonly',
        document: 'readonly',
        QUnit: 'readonly',
        window: 'readonly',
      },
    },
    plugins: {
      '@babel': babelPlugin,
      import: importPlugin,
      mocha: mochaPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...metamaskRules,
      ...metamaskMochaConfig.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      'default-param-last': 'off',
      // ESLint 7 started requiring getters for class setters; ours are write-only.
      'accessor-pairs': ['error', { enforceForClassMembers: false }],
      'require-atomic-updates': 'off',
      'import/no-unassigned-import': 'off',
      // @noble/hashes only exports its modules with their .js extension.
      'import/extensions': ['error', 'never', {
        pattern: { json: 'always' },
        pathGroupOverrides: [{ pattern: '@noble/hashes/**', action: 'ignore' }],
      }],
      // These packages publish only an "exports" map, which the import
      // plugin's resolver cannot read; webpack and Node resolve them.
      'import/no-unresolved': ['error', {
        commonjs: true,
        ignore: [
          '^@metamask/(?:address-book-controller|eth-block-tracker|eth-json-rpc-middleware|eth-json-rpc-provider|json-rpc-engine|json-rpc-middleware-stream|messenger|permission-controller)(?:/|$)',
        ],
      }],
      'prefer-destructuring': ['error', {
        'VariableDeclarator': {
          'array': false,
          'object': true,
        },
        'AssignmentExpression': {
          'array': false,
          'object': false,
        },
      }, {
        'enforceForRenamedProperties': false,
      }],
      'prefer-object-spread': 'error',
      'react/no-unused-prop-types': 'error',
      'react/no-unused-state': 'error',
      'react/jsx-boolean-value': 'error',
      'react/jsx-curly-brace-presence': ['error', { 'props': 'never', 'children': 'never' }],
      'react/jsx-equals-spacing': 'error',
      'react/no-deprecated': 'error',
      'react/default-props-match-prop-types': 'error',
      'react/jsx-closing-tag-location': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-closing-bracket-location': 'error',
      'react/jsx-first-prop-new-line': ['error', 'multiline'],
      'react/jsx-max-props-per-line': ['error', { 'maximum': 1, 'when': 'multiline' }],
      'react/jsx-tag-spacing': ['error', {
        'closingSlash': 'never',
        'beforeSelfClosing': 'always',
        'afterOpening': 'never',
      }],
      'react/jsx-wrap-multilines': ['error', {
        'declaration': 'parens-new-line',
        'assignment': 'parens-new-line',
        'return': 'parens-new-line',
        'arrow': 'parens-new-line',
        'condition': 'parens-new-line',
        'logical': 'parens-new-line',
        'prop': 'parens-new-line',
      }],

      'no-invalid-this': 'off',
      '@babel/no-invalid-this': 'error',

      '@babel/semi': ['error', 'never'],
      'mocha/no-setup-in-describe': 'off',
      // ESLint 9 also reports unused catch parameters by default; it did not before.
      'no-unused-vars': [...metamaskRules['no-unused-vars'].slice(0, 1), { ...metamaskRules['no-unused-vars'][1], caughtErrors: 'none' }],
    },
  },

  {
    files: [
      'test/**/*.js',
      'ui/app/**/*.test.js',
    ],
    rules: {
      // Sinon exposes the same methods on its CommonJS default and named exports.
      'import/no-named-as-default-member': 'off',
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
      'import/no-anonymous-default-export': ['error', { 'allowObject': true }],
      'global-require': 'off',
    },
  },

  {
    files: [
      'test/**/*-test.js',
      'test/**/*.spec.js',
    ],
    rules: {
      // Mocha will re-assign `this` in a test context
      '@babel/no-invalid-this': 'off',
    },
  },

  {
    files: [
      'development/**/*.js',
      'test/e2e/benchmark.js',
      'test/helper.js',
    ],
    rules: {
      'no-process-exit': 'off',
    },
  },

  {
    files: [
      'eslint.config.js',
      'babel.config.js',
      'nyc.config.js',
      'stylelint.config.js',
      'development/**/*.js',
      'test/e2e/**/*.js',
      'test/anvil.js',
      'test/env.js',
      'test/setup.js',
    ],
    // CommonJS: top-level declarations are local to the module, as with the
    // node environment of ESLint's old configuration format.
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
]
