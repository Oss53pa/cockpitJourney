import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore root build output + sub-project build artefacts. The mcp-server
  // ships its own dist/ (compiled JS) which we don't want to re-lint with
  // the front-end's TS rules — that triggers "rule not found" errors for
  // typescript-eslint rules on plain JS.
  { ignores: ['dist', 'mcp-server/dist', '**/dist/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Prototype/local-first app: dynamic Zustand state, JSON parsing, and
      // generic helpers intentionally use `any` in well-scoped places.
      // Downgrade to warning so CI/pre-commit don't block — re-tighten when
      // we extract typed adapters per entity.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
