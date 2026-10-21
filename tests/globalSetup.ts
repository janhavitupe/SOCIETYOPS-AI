import { execSync } from 'child_process';
import type { TestProject } from 'vitest/node';

/**
 * Runs once before the suites: brings the test schema up to date and reseeds
 * it, so every run starts from the same known data and nothing a previous run
 * left behind can change the results.
 */
export default function setup(project: TestProject) {
  const databaseUrl = project.config.env.DATABASE_URL as string;
  const env = { ...process.env, DATABASE_URL: databaseUrl, SEED_RESET: 'true', NODE_ENV: 'test' };

  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx prisma db seed', { env, stdio: 'pipe' });
}
