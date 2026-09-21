// Prisma 7 resolves its config from `prisma.config.ts` at the project root.
// Keeping it here is what lets bare `npx prisma ...` and the npm scripts work
// without an explicit --config flag.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://societyops:societyops_dev@localhost:5432/societyops?schema=public',
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
