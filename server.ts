import express from 'express';
import cors from 'cors';
import path from 'path';
import net from 'net';
import { createServer as createViteServer } from 'vite';
import { dbStore } from './src/database/store';
import authRoutes from "./src/auth/authRoutes";
import { processResidentMessage } from './src/agents/orchestrator';

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

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
app.use("/api/auth", authRoutes);

  // --- REST API ENDPOINTS ---

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'SocietyOps AI Maintenance Coordination System',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Get all tickets with optional search & filtering
  app.get('/api/tickets', (req, res) => {
    const { query, category, urgency, status } = req.query;
    const tickets = dbStore.searchTickets(
      (query as string) || '',
      (category as string) || '',
      (urgency as string) || '',
      (status as string) || ''
    );
    res.json({ count: tickets.length, tickets });
  });

  // Get ticket by ID
  app.get('/api/tickets/:id', (req, res) => {
    const ticket = dbStore.getTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(ticket);
  });

  // Create new ticket manually
  app.post('/api/tickets', (req, res) => {
    const { flatNumber, residentName, residentPhone, issueCategory, description, urgency, images } = req.body;
    if (!description || !issueCategory) {
      return res.status(400).json({ error: 'Missing required ticket fields' });
    }
    const ticket = dbStore.createTicket({
      flatNumber: flatNumber || 'B-402',
      residentName: residentName || 'Resident',
      residentPhone: residentPhone || '+91 98000 00000',
      issueCategory,
      description,
      urgency: urgency || 'Medium',
      images: images || [],
    });

    // Auto dispatch vendor
    const bestVendor = dbStore.findBestVendorForCategory(ticket.issueCategory);
    if (bestVendor) {
      dbStore.assignVendor(ticket.id, bestVendor.id, bestVendor.avgResolutionTime);
    }

    res.status(201).json(ticket);
  });

  // Update ticket
  app.patch('/api/tickets/:id', (req, res) => {
    const updated = dbStore.updateTicket(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(updated);
  });

  // Assign vendor
  app.post('/api/tickets/:id/assign', (req, res) => {
    const { vendorId, estimatedEta } = req.body;
    if (!vendorId) {
      return res.status(400).json({ error: 'vendorId is required' });
    }
    const ticket = dbStore.assignVendor(req.params.id, vendorId, estimatedEta || '30 mins');
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket or Vendor not found' });
    }
    res.json(ticket);
  });

  // Escalate ticket
  app.post('/api/tickets/:id/escalate', (req, res) => {
    const { reason } = req.body;
    const ticket = dbStore.escalateTicket(req.params.id, reason || 'Manual Manager Escalation');
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(ticket);
  });

  // Close ticket
  app.post('/api/tickets/:id/close', (req, res) => {
    const { feedback } = req.body;
    const ticket = dbStore.updateTicket(req.params.id, { status: 'Closed' });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(ticket);
  });

  // Get vendors
  app.get('/api/vendors', (req, res) => {
    const vendors = dbStore.getVendors();
    res.json({ count: vendors.length, vendors });
  });

  // Get notifications
  app.get('/api/notifications', (req, res) => {
    const notifications = dbStore.getNotifications();
    res.json({ count: notifications.length, notifications });
  });

  // Get agent logs
  app.get('/api/logs', (req, res) => {
    const logs = dbStore.getAgentLogs();
    res.json({ count: logs.length, logs });
  });

  // Get analytics report
  app.get('/api/analytics', (req, res) => {
    const report = dbStore.generateAnalyticsReport();
    res.json(report);
  });

  // Society profile management
  app.get('/api/society-profile', (req, res) => {
    res.json(dbStore.getSocietyProfile());
  });

  app.post('/api/society-profile', (req, res) => {
    const profile = dbStore.updateSocietyProfile(req.body);
    res.json(profile);
  });

  // Resident profiles and access tokens
  app.get('/api/resident-profiles', (req, res) => {
    res.json({ count: dbStore.getResidentProfiles().length, residents: dbStore.getResidentProfiles() });
  });

  app.post('/api/resident-profiles/:id/token', (req, res) => {
    const updated = dbStore.issueAccessToken(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Resident profile not found' });
    }
    res.json(updated);
  });

  // Run autonomous Follow-up Agent cycle
  app.post('/api/followup/run', (req, res) => {
    const result = dbStore.runFollowupAgentCheck();
    res.json({
      success: true,
      message: 'Autonomous Follow-up Agent cycle executed',
      ...result,
    });
  });

  // Resident AI Chat Endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { text, flatNumber, residentName, images } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text prompt is required' });
      }

      const result = await processResidentMessage(text, flatNumber, residentName, images);
      res.json(result);
    } catch (err: any) {
      console.error('Error processing chat message:', err);
      res.status(500).json({ error: err.message || 'Internal AI orchestration error' });
    }
  });

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
      console.warn('Vite dev server HMR failed, falling back to disabled HMR:', viteErr);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SocietyOps AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
