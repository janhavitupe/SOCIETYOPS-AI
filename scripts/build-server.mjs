// Bundles server.ts for production. Kept as a script rather than an npm
// one-liner because the banner needs quoting that differs between PowerShell
// and POSIX shells.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  outfile: 'dist/server.cjs',
  // The bundle is the production build, so default NODE_ENV accordingly.
  // Without this `npm start` served the Vite dev server. An explicit
  // NODE_ENV (for example in a staging container) still wins.
  banner: { js: "process.env.NODE_ENV = process.env.NODE_ENV || 'production';" },
});
