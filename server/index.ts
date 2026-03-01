import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startNotificationScheduler } from "./notifications";
import { setupAuth, registerAuthRoutes } from "./auth";
import { startCronJobs } from "./cron";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { setupPresenceServer } from "./presence";
import { registerChannelAdapters } from "./channelAdapters";
import { getQueue } from "./queue";
import oidcRouter from "./oidc";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { seedRealtorTemplate } from "./seedRealtorTemplate";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const app = express();
const httpServer = createServer(app);

// Enable gzip compression for all responses
app.use(compression({
  filter: (req, res) => {
    // Don't compress responses for webhooks
    if (req.path.includes('/webhook')) {
      return false;
    }
    // Use compression for everything else
    return compression.filter(req, res);
  },
  level: 6 // Balanced compression level
}));

// HTTP to HTTPS redirect for production (required for Google indexing)
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'];
  if (proto === 'http' && process.env.NODE_ENV === 'production') {
    const host = req.headers.host || '';
    return res.redirect(301, `https://${host}${req.url}`);
  }
  next();
});

setupPresenceServer(httpServer);

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook?.url) {
        console.log(`Webhook configured: ${result.webhook.url}`);
      } else {
        console.log('Webhook setup completed (no URL returned)');
      }
    } catch (webhookError) {
      console.log('Webhook setup skipped (may require production environment)');
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

initStripe();

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// Capture raw body for Shopify webhook HMAC verification
app.use('/api/shopify/webhooks', express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// OIDC provider for GHL SSO (must be before auth middleware)
app.use(oidcRouter);

// Setup authentication
setupAuth(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register authentication routes
  registerAuthRoutes(app);
  
  // Register channel adapters for unified inbox
  registerChannelAdapters();

  // Initialize BullMQ queue and Bull Board monitoring
  try {
    const queue = getQueue();
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/admin/queues");
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
    });
    app.use("/admin/queues", serverAdapter.getRouter());
    console.log("[Queue] Bull Board mounted at /admin/queues");

    // Admin endpoint: reprocess failed jobs
    app.post("/api/admin/queue/reprocess-failed", async (req, res) => {
      try {
        const failed = await queue.getFailed(0, 1000);
        let reprocessed = 0;
        for (const job of failed) {
          await job.retry();
          reprocessed++;
        }
        res.json({ success: true, reprocessed, total: failed.length });
      } catch (error: any) {
        console.error("[Queue] Failed to reprocess jobs:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Admin endpoint: get queue stats
    app.get("/api/admin/queue/stats", async (_req, res) => {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);
        res.json({ waiting, active, completed, failed, delayed });
      } catch (error: any) {
        console.error("[Queue] Failed to get stats:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Admin endpoint: get failed jobs detail
    app.get("/api/admin/queue/failed", async (_req, res) => {
      try {
        const failed = await queue.getFailed(0, 100);
        const jobs = failed.map(job => ({
          id: job.id,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          finishedOn: job.finishedOn,
        }));
        res.json({ jobs, count: jobs.length });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log("[Queue] Admin endpoints registered");
  } catch (queueErr) {
    console.error("[Queue] Failed to initialize queue (Redis may be unavailable):", queueErr);
  }
  
  await registerRoutes(httpServer, app);

  // Ensure SSO user exists for GHL integration
  try {
    const ssoUser = await storage.getUserByEmail('yaniv@whachatcrm.com');
    if (!ssoUser) {
      const hashedPassword = await bcrypt.hash('WhachatSSO2026!', 10);
      await storage.createUser({
        name: 'Yaniv',
        email: 'yaniv@whachatcrm.com',
        password: hashedPassword,
      });
      console.log('[SSO] Created SSO user: yaniv@whachatcrm.com');
    }
  } catch (err) {
    console.error('[SSO] Failed to seed SSO user:', err);
  }

  // Seed Realtor Growth Engine template
  try {
    await seedRealtorTemplate();
  } catch (err) {
    console.error('[Seed] Failed to seed Realtor Growth Engine template:', err);
  }

  // Start notification scheduler
  startNotificationScheduler();
  
  // Start cron jobs (trial check-in emails, etc.)
  startCronJobs();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
