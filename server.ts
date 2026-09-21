// Must precede every other import: ./src/database/prisma builds its connection
// pool at module-evaluation time and needs DATABASE_URL already in the environment.
import 'dotenv/config';
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import xss from 'xss-clean';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import morgan from 'morgan';
import path from 'path';
import net from 'net';
import { createServer as createViteServer } from 'vite';
import { prisma } from './src/database/prisma';
import { ticketRepo, vendorRepo, notificationRepo, agentLogRepo, societyProfileRepo, residentProfileRepo, authRepo } from './src/database/repositories';
import authRoutes from "./src/auth/authRoutes";
import {
  authenticateToken,
  requireAuth,
  requireManager,
  requireAdmin,
  canAccessAllTickets,
  canAccessFlat,
} from './src/auth/authMiddleware';
import { processResidentMessage } from './src/agents/orchestrator';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'societyops-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

morgan.token('message', (req) => (req as any).message || '');
const morganStream = {
  write: (message: string) => logger.info(message.trim()),
};
const morganMiddleware = morgan(
  ':method :url :status :response-time ms - :res[content-length] - :message',
  { stream: morganStream }
);

// Express 4 does not catch rejected promises from async handlers: the rejection
// never reaches the error middleware and the request hangs until the client
// times out. Every async route is registered through this wrapper instead.
type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

const route = (handler: AsyncRouteHandler): RequestHandler => (req, res, next) => {
  handler(req, res, next).catch(next);
};

async function startServer() {
  const app = express();
  const defaultPort = Number(process.env.PORT) || 3000;

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

  const PORT = await findAvailablePort(defaultPort);

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
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' },
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

  app.get('/api/health', async (req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      database = 'unreachable';
      logger.error('Health check: database unreachable', { error: (err as Error).message });
    }

    const healthy = database === 'ok';
    logger.info('Health check requested', { ip: req.ip, database });
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'SocietyOps AI Maintenance Coordination System',
      version: '1.0.0',
      database,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/tickets', requireAuth, route(async (req, res) => {
    const { query, category, urgency, status } = req.query;
    const user = req.user!;

    // Managers see the whole society; residents are scoped to their own flat in
    // the query itself, so no other flat's tickets are ever loaded.
    const flatScope = canAccessAllTickets(user) ? undefined : user.flatNumber;

    const tickets = await ticketRepo.search(
      (query as string) || '',
      (category as string) || '',
      (urgency as string) || '',
      (status as string) || '',
      flatScope
    );

    logger.info('Tickets listed', { count: tickets.length, role: user.role, flatScope, query, category, urgency, status });
    res.json({ count: tickets.length, tickets });
  }));

  app.get('/api/tickets/:id', requireAuth, route(async (req, res) => {
    const ticket = await ticketRepo.findById(req.params.id);
    if (!ticket) {
      logger.warn('Ticket not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (!canAccessFlat(req.user!, ticket.flatNumber)) {
      logger.warn('Ticket access denied', { ticketId: req.params.id, userId: req.user!.id, role: req.user!.role });
      return res.status(403).json({ error: 'You do not have access to this ticket' });
    }
    logger.info('Ticket retrieved', { ticketId: req.params.id });
    res.json(ticket);
  }));

  app.post('/api/tickets', requireAuth, route(async (req, res) => {
    const { flatNumber, residentName, residentPhone, issueCategory, description, urgency, images } = req.body;
    if (!description || !issueCategory) {
      logger.warn('Ticket creation failed - missing fields', { description: !!description, issueCategory: !!issueCategory });
      return res.status(400).json({ error: 'Missing required ticket fields' });
    }

    // Identity comes from the token, not the body: a resident may only file
    // against their own flat. Managers may file on someone's behalf, so the
    // body's flat and name are honoured only for them.
    const user = req.user!;
    const isManager = canAccessAllTickets(user);

    let ticket = await ticketRepo.create({
      flatNumber: isManager ? (flatNumber || user.flatNumber) : user.flatNumber,
      residentName: isManager ? (residentName || user.name) : user.name,
      residentPhone: residentPhone || '+91 98000 00000',
      issueCategory,
      description,
      urgency: urgency || 'Medium',
      images: images || [],
      residentId: isManager ? undefined : user.id,
    });

    const bestVendor = await vendorRepo.findBestForCategory(ticket.issueCategory);
    if (bestVendor) {
      await ticketRepo.assignVendor(ticket.id, bestVendor.id, bestVendor.avgResolutionTime);
      const updated = await ticketRepo.findById(ticket.id);
      if (updated) ticket = updated;
    }

    logger.info('Ticket created', { ticketId: ticket.id, category: ticket.issueCategory, urgency: ticket.urgency });
    res.status(201).json(ticket);
  }));

  app.patch('/api/tickets/:id', requireManager, route(async (req, res) => {
    // Whitelisted. req.body used to be spread straight into the Prisma update,
    // which let a caller write any column on the row, including its id and
    // timestamps.
    const updates: Record<string, unknown> = {};
    for (const field of ['status', 'urgency', 'description', 'issueCategory', 'estimatedEta'] as const) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const updated = await ticketRepo.update(req.params.id, updates);
    if (!updated) {
      logger.warn('Ticket update failed - not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    logger.info('Ticket updated', { ticketId: req.params.id });
    res.json(updated);
  }));

  app.post('/api/tickets/:id/assign', requireManager, route(async (req, res) => {
    const { vendorId, estimatedEta } = req.body;
    if (!vendorId) {
      logger.warn('Vendor assignment failed - missing vendorId', { ticketId: req.params.id });
      return res.status(400).json({ error: 'vendorId is required' });
    }
    const ticket = await ticketRepo.assignVendor(req.params.id, vendorId, estimatedEta || '30 mins');
    if (!ticket) {
      logger.warn('Vendor assignment failed - not found', { ticketId: req.params.id, vendorId });
      return res.status(404).json({ error: 'Ticket or Vendor not found' });
    }
    logger.info('Vendor assigned', { ticketId: req.params.id, vendorId, estimatedEta });
    res.json(ticket);
  }));

  // Residents may escalate their own stuck ticket; managers may escalate any.
  app.post('/api/tickets/:id/escalate', requireAuth, route(async (req, res) => {
    const existing = await ticketRepo.findById(req.params.id);
    if (!existing) {
      logger.warn('Escalation failed - ticket not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (!canAccessFlat(req.user!, existing.flatNumber)) {
      logger.warn('Escalation denied', { ticketId: req.params.id, userId: req.user!.id });
      return res.status(403).json({ error: 'You do not have access to this ticket' });
    }

    const { reason } = req.body;
    const ticket = await ticketRepo.escalateTicket(req.params.id, reason || 'Manual Manager Escalation');
    if (!ticket) {
      logger.warn('Escalation failed - ticket not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    logger.info('Ticket escalated', { ticketId: req.params.id, reason });
    res.json(ticket);
  }));

  // Residents may close their own ticket once it is done; managers may close any.
  app.post('/api/tickets/:id/close', requireAuth, route(async (req, res) => {
    const existing = await ticketRepo.findById(req.params.id);
    if (!existing) {
      logger.warn('Close ticket failed - not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (!canAccessFlat(req.user!, existing.flatNumber)) {
      logger.warn('Close denied', { ticketId: req.params.id, userId: req.user!.id });
      return res.status(403).json({ error: 'You do not have access to this ticket' });
    }

    const ticket = await ticketRepo.update(req.params.id, { status: 'Closed' });
    if (!ticket) {
      logger.warn('Close ticket failed - not found', { ticketId: req.params.id });
      return res.status(404).json({ error: 'Ticket not found' });
    }
    logger.info('Ticket closed', { ticketId: req.params.id });
    res.json(ticket);
  }));

  app.get('/api/vendors', requireAuth, route(async (req, res) => {
    const vendors = await vendorRepo.findAll();
    logger.info('Vendors listed', { count: vendors.length });
    res.json({ count: vendors.length, vendors });
  }));

  // Dispatch logs carry other residents' names, phone numbers and messages.
  app.get('/api/notifications', requireManager, route(async (req, res) => {
    const notifications = await notificationRepo.findAll();
    logger.info('Notifications listed', { count: notifications.length });
    res.json({ count: notifications.length, notifications });
  }));

  app.get('/api/logs', requireManager, route(async (req, res) => {
    const logs = await agentLogRepo.findAll();
    logger.info('Agent logs listed', { count: logs.length });
    res.json({ count: logs.length, logs });
  }));

  app.get('/api/analytics', requireManager, route(async (req, res) => {
    const allTickets = await ticketRepo.findAll();
    const openTickets = allTickets.filter(t => t.status === 'Open' || t.status === 'Vendor Assigned' || t.status === 'In Progress').length;
    const inProgressTickets = allTickets.filter(t => t.status === 'Vendor Assigned' || t.status === 'In Progress').length;
    const resolvedToday = allTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
    const escalatedCount = allTickets.filter(t => t.status === 'Escalated').length;
    const slaAtRiskCount = allTickets.filter(t => t.urgency === 'High' && (t.status === 'Open' || t.status === 'Vendor Assigned')).length;

    const catMap: Record<string, number> = {};
    allTickets.forEach(t => { catMap[t.issueCategory] = (catMap[t.issueCategory] || 0) + 1; });
    let topCat = 'Plumbing';
    let maxCount = 0;
    Object.entries(catMap).forEach(([cat, cnt]) => { if (cnt > maxCount) { maxCount = cnt; topCat = cat; } });

    const report = {
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      totalTickets: allTickets.length,
      openTickets,
      inProgressTickets,
      resolvedToday,
      escalatedCount,
      avgResponseTimeMinutes: 18,
      frequentCategory: topCat,
      topPerformingVendor: 'Ramesh Kumar Plumber (4.9 stars)',
      summaryText: `SocietyOps AI managed ${allTickets.length} total tickets with an average first-response speed of 18 minutes. ${resolvedToday} tickets successfully closed today. ${topCat} remains the most requested category.`,
      recommendations: [
        'Schedule preventive maintenance check for Tower B Elevator ARD battery',
        'Stock extra master bathroom flush valves in RWA inventory',
        'Add 1 backup Electrician vendor for weekend evening slots'
      ],
      slaAtRiskCount,
    };

    logger.info('Analytics report generated');
    res.json(report);
  }));

  app.get('/api/society-profile', requireAuth, route(async (req, res) => {
    const profile = await societyProfileRepo.find();
    logger.info('Society profile retrieved');
    res.json(profile);
  }));

  app.post('/api/society-profile', requireManager, route(async (req, res) => {
    const profile = await societyProfileRepo.update(req.body);
    logger.info('Society profile updated');
    res.json(profile);
  }));

  app.get('/api/resident-profiles', requireManager, route(async (req, res) => {
    const residents = await residentProfileRepo.findAll();

    // accessToken is a standing credential for the account; it must never leave
    // the server in a list response.
    const safe = residents.map(({ accessToken, ...rest }) => rest);

    logger.info('Resident profiles listed', { count: safe.length });
    res.json({ count: safe.length, residents: safe });
  }));

  // Issues a new standing access token, so this is admin-only.
  app.post('/api/resident-profiles/:id/token', requireAdmin, route(async (req, res) => {
    const updated = await residentProfileRepo.issueAccessToken(req.params.id);
    if (!updated) {
      logger.warn('Token issuance failed - resident not found', { residentId: req.params.id });
      return res.status(404).json({ error: 'Resident profile not found' });
    }
    logger.info('Access token issued', { residentId: req.params.id });
    res.json(updated);
  }));

  app.post('/api/followup/run', requireManager, route(async (req, res) => {
    let remindersSent = 0;
    const escalatedTickets: any[] = [];
    const allTickets = await ticketRepo.findAll();

    for (const ticket of allTickets) {
      if (ticket.status === 'Open') {
        const vendor = await vendorRepo.findBestForCategory(ticket.issueCategory);
        if (vendor) {
          await ticketRepo.assignVendor(ticket.id, vendor.id, '25 mins');
          remindersSent++;
        }
      } else if (ticket.status === 'Vendor Assigned') {
        const isEmergency = ticket.description.toLowerCase().includes('stuck') ||
                            ticket.description.toLowerCase().includes('gas') ||
                            ticket.description.toLowerCase().includes('sewage');

        if (isEmergency && ticket.urgency === 'High') {
          const updated = await ticketRepo.escalateTicket(ticket.id, 'Urgent life-safety keyword auto-detected during Follow-up Agent cycle');
          if (updated) escalatedTickets.push(updated);
        } else {
          if (ticket.assignedVendorId) {
            await notificationRepo.create({
              ticketId: ticket.id,
              recipientType: 'vendor',
              recipientName: ticket.assignedVendorName || 'Vendor',
              phone: ticket.assignedVendorPhone || '',
              message: `REMINDER: Please confirm arrival at ${ticket.flatNumber} for ticket #${ticket.id}. Resident is waiting.`,
              channel: 'WhatsApp',
              language: 'English'
            });
            remindersSent++;
          }
        }
      }
    }

    await agentLogRepo.create({
      agentName: 'Follow-up Agent',
      action: 'Autonomous Cycle Completed',
      details: `Checked ${allTickets.length} tickets. Sent ${remindersSent} vendor pings, auto-escalated ${escalatedTickets.length} emergency tickets.`,
    });

    logger.info('Follow-up agent cycle executed', { checkedCount: allTickets.length, escalatedTickets: escalatedTickets.length, remindersSent });
    res.json({
      success: true,
      message: 'Autonomous Follow-up Agent cycle executed',
      checkedCount: allTickets.length,
      escalatedTickets,
      remindersSent,
    });
  }));

  app.post('/api/chat', requireAuth, route(async (req, res) => {
    try {
      const { text, images } = req.body;
      if (!text) {
        logger.warn('Chat request failed - missing text');
        return res.status(400).json({ error: 'Text prompt is required' });
      }

      // Identity comes from the token. The body used to supply flatNumber and
      // residentName, which let any caller raise a ticket as any resident.
      const user = req.user!;
      const result = await processResidentMessage(text, user.flatNumber, user.name, images);
      logger.info('Chat message processed', {
        flatNumber: user.flatNumber,
        textLength: text.length,
        source: result.source,
        fallbackReason: result.fallbackReason,
      });
      res.json(result);
    } catch (err: any) {
      logger.error('Error processing chat message', { error: err.message, stack: err.stack });
      res.status(500).json({ error: err.message || 'Internal AI orchestration error' });
    }
  }));

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

  const gracefulShutdown = () => {
    logger.info('Received shutdown signal, closing server gracefully...');
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

startServer();
