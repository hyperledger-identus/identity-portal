import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'out-tsc',
      'node_modules',
      'docs/api',
      // Mongo-shell / provisioning scripts run outside the app's module system.
      'docker',
      // Generated Cloud-Agent OpenAPI client/spec (produced by openapi-typescript);
      // not hand-maintained, so it is not linted.
      'src/utils/agent/cloud-agent/spec.ts',
      'src/utils/agent/cloud-agent/client.ts',
      // CommonJS build/tooling configs — linted implicitly by their own runtime.
      '**/*.cjs',
      'esbuild.config.mjs',
      'vite.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow intentionally-unused args/vars when prefixed with `_` (common for
      // Express middleware signatures that must keep their arity), and vars
      // destructured only to omit them via a rest spread.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // Unimplemented agent stubs keep their full signatures; don't flag
          // their unused args. Unused variables and imports are still caught.
          args: 'none',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  prettier,
);
