import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * The driver adapter does not read ?schema= from the URL the way Prisma's own
 * engine did, so without this a non-public schema was migrated by the CLI but
 * never queried by the app.
 */
function schemaFromUrl(url?: string): string | undefined {
  try {
    return url ? new URL(url).searchParams.get('schema') || undefined : undefined;
  } catch {
    return undefined;
  }
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: schemaFromUrl(process.env.DATABASE_URL) }),
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
