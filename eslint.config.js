import pluginImport from 'eslint-plugin-import';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['!lib/**/*', '**/*.ts'],
    plugins: {
      import: pluginImport,
      '@typescript-eslint': tsPlugin
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      'import/extensions': ['error', 'always']
    }
  },
];