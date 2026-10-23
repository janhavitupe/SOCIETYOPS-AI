import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { currentSocietyId } from '../requestContext';

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

/** The schema this process works in: ?schema= in DATABASE_URL, else public. */
export const DATABASE_SCHEMA = schemaFromUrl(process.env.DATABASE_URL) ?? 'public';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(DATABASE_SCHEMA)) {
  throw new Error(`DATABASE_URL names an unusable schema: ${DATABASE_SCHEMA}`);
}

/**
 * search_path is set on every connection, not only passed to Prisma's
 * generated queries, so raw SQL (the ticket-number sequence, the seed's
 * TRUNCATE) also stays in this schema. Without it raw statements fell through
 * to public: a test run reseeding its own schema emptied the dev data.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${DATABASE_SCHEMA}`,
});

/**
 * The client with no tenant scoping. Only for code that is deliberately
 * society-agnostic: authentication, the society switcher, the job scheduler
 * finding which societies to run for, the seed and test setup.
 */
export const unscopedPrisma = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: DATABASE_SCHEMA }),
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

/** Models whose rows belong to one society, keyed by Prisma's model name. */
export const TENANT_MODELS = new Set<string>([
  'Tower',
  'Flat',
  'FlatOccupant',
  'CommonArea',
  'Asset',
  'Invite',
  'SocietyProfile',
  'Ticket',
  'Vendor',
  'NotificationLog',
  'AgentActivityLog',
  'ChatMessage',
  'Notice',
  'MaintenanceSchedule',
  'Licence',
]);

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation} ran with no society in context; use withSociety() or unscopedPrisma`);
    this.name = 'TenantScopeError';
  }
}

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

/** Adds the society to a query's filter, and to the data it writes. */
function scopeArgs(operation: string, args: any, societyId: string): any {
  const scoped = { ...args };

  if (WHERE_OPERATIONS.has(operation) || operation === 'upsert') {
    scoped.where = { ...scoped.where, societyId };
  }

  if (operation === 'create') {
    scoped.data = { ...scoped.data, societyId };
  } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const rows = Array.isArray(scoped.data) ? scoped.data : [scoped.data];
    scoped.data = rows.map((row: object) => ({ ...row, societyId }));
  } else if (operation === 'upsert') {
    scoped.create = { ...scoped.create, societyId };
  }

  // Moving a row to another society is never a legitimate update.
  if ((operation === 'update' || operation === 'updateMany' || operation === 'upsert') && scoped.data?.societyId) {
    delete scoped.data.societyId;
  }

  return scoped;
}

/**
 * The client every route, repository and agent tool uses.
 *
 * Every query on a society's data is filtered to the society in the request
 * context, and every row it creates is stamped with it, so a route cannot
 * forget the filter and leak one society's data into another. A query with no
 * society in context is refused rather than run unscoped.
 */
export const prisma = unscopedPrisma.$extends({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);

        const societyId = currentSocietyId();
        if (!societyId) throw new TenantScopeError(model, operation);

        return query(scopeArgs(operation, args, societyId));
      },
    },
  },
});

export type Db = typeof prisma;
export type { Prisma };
