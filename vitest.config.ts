import { defineConfig } from 'vitest/config';

// A dedicated config so vitest does not inherit vite.config.ts, whose React and
// Tailwind plugins are irrelevant here and slow the run down.
export default defineConfig({
  test: {
    environment: 'node',
    // Set here rather than in the npm script: `NODE_ENV=test vitest` is not
    // valid syntax in PowerShell, which is where this is run.
    env: { NODE_ENV: 'test' },
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // The API tests share one PostgreSQL database, so files must not race.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
