// eslint-config-next v16 ships a native flat config (an array), so it is spread
// directly — no @eslint/eslintrc FlatCompat wrapper.
import next from 'eslint-config-next';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/db/migrations/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...next,
];

export default config;
