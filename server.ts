// Must precede every other import: ./src/database/prisma builds its connection
// pool at module-evaluation time and needs DATABASE_URL already in the environment.
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import xss from 'xss-clean';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import path from 'path';
import net from 'net';
import { createServer as createViteServer } from 'vite';
import { logger, morganMiddleware } from './src/logger';
import authRoutes from './src/auth/authRoutes';
import { authenticateToken } from './src/auth/authMiddleware';
import { startFollowupScheduler } from './src/services/followup';
import healthRoutes from './src/routes/health';
import ticketRoutes from './src/routes/tickets';
import vendorRoutes from './src/routes/vendors';
import operationsRoutes from './src/routes/operations';
import societyRoutes from './src/routes/society';
import followupRoutes from './src/routes/followup';
import chatRoutes from './src/routes/chat';

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(startPort: number, maxAttempts = 50): Promise<number> {
  let port = startPort;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await isPortFree(port)) return port;
    port += 1;
  }
  throw new Error(`No available port found starting at ${startPort}`);
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
  opts: { attachFrontend?: (app: express.Application) => void | Promise<void> } = {}
): Promise<express.Application> {
  const app = express();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));

  if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
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

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' },
    // Five login attempts per 15 minutes is far too few to test the auth flow.
    skip: () => process.env.NODE_ENV === 'test',
  });

  // Scoped to /api: mounted globally it also throttles the SPA's static assets
  // and HMR traffic, which exhausts the quota during a single page load.
  app.use('/api', generalLimiter);
  app.use(express.json({ limit: '10mb' }));
  app.use(xss());
  app.use(hpp({ whitelist: ['query', 'category', 'urgency', 'status'] }));
  app.use(morganMiddleware);

  // Populates req.user for every API route. The per-route guards below decide
  // what actually requires a session; this only decodes the token.
  app.use('/api', authenticateToken);

  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth', authRoutes);

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


  if (opts.attachFrontend) {
    await opts.attachFrontend(app);
  }

  // Terminal error handler. Async routes reach it via `route()`; registered last
  // so it sits behind both the API routes and the Vite/static middleware.
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
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

    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function startServer() {
  const PORT = await findAvailablePort(Number(process.env.PORT) || 3000);

  const app = await createApp({
    attachFrontend: async (app) => {
    // --- VITE MIDDLEWARE SETUP ---
    const HMR_PORT = Number(process.env.HMR_PORT) || 24678;
    if (process.env.NODE_ENV !== 'production') {
      try {
        const vite = await createViteServer({
          server: { middlewareMode: true, hmr: { port: HMR_PORT } },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } catch (viteErr) {
        logger.warn('Vite dev server HMR failed, falling back to disabled HMR', { error: (viteErr as Error).message });
        const vite = await createViteServer({
          server: { middlewareMode: true, hmr: false },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      }
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
    },
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`SocietyOps AI server running at http://0.0.0.0:${PORT}`, { port: PORT, env: process.env.NODE_ENV || 'development' });
  });

  // Runs the follow-up agent unattended when FOLLOWUP_INTERVAL_MINUTES is set.
  // Without it the "autonomous" cycle only ran when someone pressed a button.
  const stopFollowupScheduler = startFollowupScheduler((err) =>
    logger.error('Scheduled follow-up cycle failed', { error: err.message, stack: err.stack })
  );

  if (stopFollowupScheduler) {
    logger.info('Follow-up scheduler enabled', { everyMinutes: Number(process.env.FOLLOWUP_INTERVAL_MINUTES) });
  }

  const gracefulShutdown = () => {
    logger.info('Received shutdown signal, closing server gracefully...');
    stopFollowupScheduler?.();
    server.close(() => {
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
