// Must precede every other import: ./src/database/prisma builds its connection
// pool at module-evaluation time and needs DATABASE_URL already in the environment.
import 'dotenv/config';
// Before the app is built, so error tracking can hook the HTTP server.
import './src/instrument';
import * as Sentry from '@sentry/node';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { logger, morganMiddleware } from './src/logger';
import { requestId } from './src/requestContext';
import { storageOrigin } from './src/services/storage';
import { toNodeHandler } from 'better-auth/node';
import { auth, allowedOrigins, CLIENT_IP_HEADER } from './src/auth/auth';
import { authenticate } from './src/auth/authMiddleware';
import accountRoutes from './src/routes/account';
import societiesRoutes from './src/routes/societies';
import { startJobs, stopJobs } from './src/services/jobs';
import healthRoutes from './src/routes/health';
import ticketRoutes from './src/routes/tickets';
import vendorRoutes from './src/routes/vendors';
import operationsRoutes from './src/routes/operations';
import societyRoutes from './src/routes/society';
import followupRoutes from './src/routes/followup';
import chatRoutes from './src/routes/chat';
import uploadRoutes from './src/routes/uploads';
import buildingRoutes from './src/routes/buildings';
import joiningRoutes from './src/routes/joining';
import workerRoutes from './src/routes/worker';
import placeRoutes from './src/routes/places';
import residentRoutes from './src/routes/residents';
import householdRoutes from './src/routes/household';
import onboardingRoutes from './src/routes/onboarding';

/** TRUST_PROXY as Express wants it: a hop count, true/false, or a list of addresses. */
function trustProxySetting(value?: string): boolean | number | string {
  if (!value) return false;
  if (value === 'true' || value === 'false') return value === 'true';
  return /^\d+$/.test(value) ? Number(value) : value;
}

/** The origin a Sentry DSN reports to, for the CSP. */
function sentryOrigin(dsn?: string): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}

/**
 * Builds the Express app: middleware, routes and the terminal error handler.
 *
 * Separated from startServer so tests can mount the real app with supertest
 * without binding a port or booting Vite. `attachFrontend` runs after the API
 * routes and before the error handler, which is where the SPA middleware
 * has to sit.
 */
export async function createApp(
  opts: { attachFrontend?: (app: express.Application) => void | Promise<void> } = {},
): Promise<express.Application> {
  const app = express();

  // Behind a load balancer or proxy, set TRUST_PROXY (for example to 1, the
  // number of hops) so req.ip is the client rather than the proxy.
  app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));

  // First, so everything after it (including CORS refusals) logs with the id.
  app.use(requestId);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }),
  );

  if (process.env.NODE_ENV === 'production') {
    // Photos load from, and upload to, object storage; browser errors go to Sentry.
    const extra = [storageOrigin(), sentryOrigin(process.env.VITE_SENTRY_DSN)].filter((o): o is string => !!o);
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            imgSrc: ["'self'", 'data:', 'blob:', ...extra],
            connectSrc: ["'self'", ...extra],
          },
        },
      }),
    );
  } else {
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  }

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    // The suite issues far more than 100 requests per run.
    skip: () => process.env.NODE_ENV === 'test',
  });

  // Scoped to /api: mounted globally it also throttles the SPA's static assets
  // and HMR traffic, which exhausts the quota during a single page load.
  app.use('/api', generalLimiter);
  app.use(morganMiddleware);

  // Sign-in, OTP, sessions and sign-out (src/auth/auth.ts). Before the JSON
  // parser because Better Auth reads the body itself; it applies its own,
  // tighter rate limits to the OTP and password endpoints.
  app.all(
    '/api/auth/*splat',
    (req, _res, next) => {
      req.headers[CLIENT_IP_HEADER] = req.ip || req.socket.remoteAddress || '';
      next();
    },
    toNodeHandler(auth),
  );

  // Photos go to object storage, not the JSON body, so a small limit suffices.
  app.use(express.json({ limit: '100kb' }));

  // Resolves the session into req.identity and req.user and scopes every
  // query to the user's society. The per-route guards decide what needs what.
  app.use('/api', authenticate);
  app.use('/api', accountRoutes);
  app.use('/api', societiesRoutes);

  // --- REST API ENDPOINTS ---
  //
  // Route handlers live in src/routes. They were previously all inline here,
  // which had grown server.ts past 550 lines and mixed HTTP wiring with
  // business logic.

  app.use('/api', healthRoutes);
  app.use('/api', ticketRoutes);
  app.use('/api', vendorRoutes);
  app.use('/api', operationsRoutes);
  app.use('/api', societyRoutes);
  app.use('/api', followupRoutes);
  app.use('/api', chatRoutes);
  app.use('/api', uploadRoutes);
  app.use('/api', buildingRoutes);
  app.use('/api', joiningRoutes);
  app.use('/api', workerRoutes);
  app.use('/api', placeRoutes);
  app.use('/api', residentRoutes);
  app.use('/api', householdRoutes);
  app.use('/api', onboardingRoutes);

  // An API path nothing handles is an error, not the web page: answering with
  // the SPA's HTML hid a stale server whose routes were missing.
  app.use('/api', (req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

  if (opts.attachFrontend) {
    await opts.attachFrontend(app);
  }

  // Reports errors to Sentry when SENTRY_DSN is set, then passes them on.
  Sentry.setupExpressErrorHandler(app);

  // Terminal error handler. Express 5 forwards rejected async handlers here;
  // registered last so it sits behind both the API routes and the frontend.
  app.use((err: Error & { type?: string }, req: Request, res: Response, _next: NextFunction) => {
    // body-parser failures are the client's fault, not a server error.
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large' });
    }

    logger.error('Unhandled request error', {
      method: req.method,
      url: req.originalUrl,
      error: err.message,
      stack: err.stack,
    });

    if (res.headersSent) return;

    if (err.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    // The id lets a user's report be matched to the log lines and Sentry event.
    res.status(500).json({ error: 'Internal server error', requestId: res.getHeader('X-Request-Id') });
  });

  return app;
}

/**
 * Serves the built SPA in production and the Vite dev server otherwise.
 *
 * The production bundle defaults NODE_ENV to production (scripts/build-server.mjs);
 * `npm start` used to boot the dev server because nothing set it.
 */
async function attachFrontend(app: express.Application) {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
    return;
  }

  // Imported here so the production image never loads Vite.
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { port: Number(process.env.HMR_PORT) || 24678 } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

async function startServer() {
  // A fixed port: silently moving to the next free one broke container port
  // mapping and left two copies of the app running unnoticed.
  const PORT = Number(process.env.PORT) || 3000;

  const app = await createApp({ attachFrontend });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  });

  // Express 5 calls this on failure too, with the error.
  const server = app.listen(PORT, '0.0.0.0', (err?: NodeJS.ErrnoException) => {
    if (err) {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop the other process or set PORT.`, { port: PORT });
      } else {
        logger.error('HTTP server failed', { error: err.message, stack: err.stack });
      }
      process.exit(1);
    }
    logger.info(`SocietyOps AI server running at http://0.0.0.0:${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
    });
  });

  // The follow-up agent and other scheduled work run from the job queue.
  // A queue failure is logged but does not take the API down with it.
  await startJobs().catch((err: Error) =>
    logger.error('Job queue failed to start; scheduled work is not running', { error: err.message, stack: err.stack }),
  );

  const gracefulShutdown = () => {
    logger.info('Received shutdown signal, closing server gracefully...');
    server.close(async () => {
      await stopJobs().catch((err: Error) => logger.error('Job queue did not stop cleanly', { error: err.message }));
      logger.info('Server closed successfully');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Tests import createApp directly; only a real run should bind a port.
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
