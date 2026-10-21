import 'dotenv/config';
import { defineConfig } from 'vitest/config';

/**
 * Tests run in their own schema of the configured database, never against the
 * data people are working with. They used to share the dev database, so test
 * vendors and tickets mixed with real ones, and once dispatch started
 * rebalancing queues, test activity moved real residents' tickets around.
 * tests/globalSetup.ts migrates and seeds this schema afresh on every run.
 */
function testDatabaseUrl(): string {
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) to run the tests');
  const url = new URL(base);
  if (!process.env.TEST_DATABASE_URL) url.searchParams.set('schema', 'societyops_test');
  return url.toString();
}

// A dedicated config so vitest does not inherit vite.config.ts, whose React and
// Tailwind plugins are irrelevant here and slow the run down.
export default defineConfig({
  test: {
    environment: 'node',
    // Set here rather than in the npm script: `NODE_ENV=test vitest` is not
    // valid syntax in PowerShell, which is where this is run.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      UPLOAD_DIR: '.test-uploads',
      STORAGE_DRIVER: 'local',
      // Tests never call the real model: they must not depend on an outside
      // service, cost money, or change with the model's mood. An empty value
      // wins over .env (dotenv does not override variables already set).
      GROQ_API_KEY: '',
    },
    globalSetup: ['./tests/globalSetup.ts'],
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // The API tests share one PostgreSQL schema, so files must not race.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
