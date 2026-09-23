const base = require('./packages/config/eslint/base');

module.exports = [
  ...base,
  {
    files: [
      'apps/api/src/plugins/plugin-loader.service.ts',
      'plugins/*/src/server/index.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
