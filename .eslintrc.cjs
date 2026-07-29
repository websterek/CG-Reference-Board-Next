/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true },
      node: { extensions: ['.js', '.ts', '.tsx'] },
    },
  },
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/client/src/ui/**'],
            message:
              'UI code (client/src/ui/**) must not import Yjs, Hocuspocus, or ./collab/** (D1 boundary). UI consumes domain events only.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Apply the restriction only to client/src/ui files via glob
      files: ['packages/client/src/ui/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'yjs',
                message: 'UI layer (client/src/ui/**) must not import yjs directly (D1).',
              },
              {
                name: '@hocuspocus/provider',
                message:
                  'UI layer (client/src/ui/**) must not import @hocuspocus/provider (D1).',
              },
              {
                name: '@hocuspocus/server',
                message:
                  'UI layer (client/src/ui/**) must not import @hocuspocus/server (D1).',
              },
            ],
            patterns: [
              {
                group: ['./collab/**', '../collab/**', '../../collab/**'],
                message:
                  'UI layer (client/src/ui/**) must not import from ./collab/** (D1 boundary).',
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '.vite'],
};
