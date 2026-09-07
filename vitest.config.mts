import path from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': path.resolve(import.meta.dirname, 'src'),
  '@tests': path.resolve(import.meta.dirname, 'tests'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Requires a running Postgres (`pnpm db:up && pnpm db:migrate`).
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/env.ts'],
          // Shared database state — serial avoids cross-test interference.
          fileParallelism: false,
        },
      },
      {
        // Extraction golden-set eval. Phase 5. Hits a real LLM, so it is slow
        // and lives outside `pnpm test`.
        resolve: { alias },
        test: {
          name: 'eval',
          include: ['tests/eval/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/env.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
