import { spawn } from 'node:child_process';

/**
 * Runs the degradation suite against a server with no AI providers.
 *
 * Why this exists: `next start` loads .env.local, so the ordinary local server
 * always has real Sarvam and Groq keys. tests/e2e/degradation.spec.ts asserts
 * the opposite state, so locally it could never pass — and worse, its
 * assertions would spend real quota calling providers in the expectation that
 * they fail.
 *
 * Blanking the keys in the child environment is what makes the run honest:
 * @next/env skips variables already present in process.env, so an empty string
 * set here wins over the value in .env.local.
 *
 * CI does not need this. There is no .env.local there, so the default server is
 * already keyless and `pnpm test:e2e` exercises the suite directly.
 */
const child = spawn(
  'pnpm',
  ['exec', 'playwright', 'test', 'tests/e2e/degradation.spec.ts', '--project=chromium'],
  {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      E2E_DEGRADED: '1',
      GROQ_API_KEY: '',
      SARVAM_API_KEY: '',
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
