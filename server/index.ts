import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startNotificationScheduler } from "./notifications";
import { setupAuth, registerAuthRoutes } from "./auth";
import { startCronJobs } from "./cron";
import { WebhookHandlers } from "./webhookHandlers";
import { setupPresenceServer } from "./presence";
import { registerChannelAdapters } from "./channelAdapters";
import { getQueue } from "./queue";
import { startInstagramDevPolling } from "./instagramPolling";
import "./worker";
import oidcRouter from "./oidc";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { seedRealtorTemplate } from "./seedRealtorTemplate";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

console.log("ENV CHECK:", {
  DATABASE_URL: !!process.env.DATABASE_URL,
  STRIPE_KEY: !!process.env.STRIPE_SECRET_KEY,
  OPENAI: !!process.env.OPENAI_API_KEY,
  REDIS: !!process.env.REDIS_URL,
  APP_URL: !!process.env.APP_URL
});

async function runStartupGhlCleanup() {
  const targetUserId = process.env.GHL_CLEANUP_USER_ID;
  if (!targetUserId) return;
  const mode = process.env.GHL_CLEANUP_MODE || 'no_messages';
  console.log(`[GHL Startup Cleanup] Running cleanup for user ${targetUserId}, mode=${mode}`);
  try {
    const { db } = await import('../drizzle/db');
    const { contacts, conversations } = await import('../shared/schema');
    const { eq, and, inArray } = await import('drizzle-orm');

    const userIntegrations = await storage.getIntegrations(targetUserId);
    const ghlIntegrations = userIntegrations.filter((i: any) => i.type === 'gohighlevel');
    let disabledCount = 0;
    for (const integration of ghlIntegrations) {
      await storage.updateIntegration(integration.id, { isActive: false });
      disabledCount++;
    }
    console.log(`[GHL Startup Cleanup] Disabled ${disabledCount} GHL integrations`);

    const allGhlContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, targetUserId), eq(contacts.source, 'gohighlevel')));

    if (allGhlContacts.length === 0) {
      console.log(`[GHL Startup Cleanup] No GHL contacts found for user`);
      return;
    }

    const allGhlContactIds = allGhlContacts.map((c: any) => c.id);
    let toDeleteIds: string[] = [];

    if (mode === 'no_messages') {
      const convWithMessages = await db
        .select({ contactId: conversations.contactId })
        .from(conversations)
        .where(and(inArray(conversations.contactId, allGhlContactIds), eq(conversations.channel, 'gohighlevel')));
      const contactIdsWithConvs = new Set(convWithMessages.map((c: any) => c.contactId));
      toDeleteIds = allGhlContactIds.filter((id: string) => !contactIdsWithConvs.has(id));
    } else if (mode === 'all_ghl') {
      toDeleteIds = allGhlContactIds;
    }

    let deleted = 0;
    const BATCH = 500;
    for (let i = 0; i < toDeleteIds.length; i += BATCH) {
      const batch = toDeleteIds.slice(i, i + BATCH);
      await db.delete(contacts).where(inArray(contacts.id, batch));
      deleted += batch.length;
    }
    console.log(`[GHL Startup Cleanup] Deleted ${deleted} contacts (mode=${mode}), ${allGhlContacts.length - deleted} remain`);
  } catch (err) {
    console.error('[GHL Startup Cleanup] Error:', err);
  }
}

const app = express();
const httpServer = createServer(app);

// Redirect apex domain to www (preserve path + query)
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host === "whachatcrm.com") {
    return res.redirect(301, `https://www.whachatcrm.com${req.url}`);
  }
  next();
});

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

// Capture raw body for Meta webhook HMAC verification
// MUST be registered before the global express.json() middleware
app.use('/api/webhook/meta', express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Calendly CRM webhooks — raw body required for HMAC signature verification
app.use('/api/webhooks/calendly', express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Do NOT run the global JSON parser on /api/webhook/meta — a second parse can
// consume an already-read stream and replace req.body with {}, breaking HMAC + routing.
const globalJsonParser = express.json();
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/webhook/meta")) {
    return next();
  }
  if (req.path.startsWith("/api/webhooks/calendly")) {
    return next();
  }
  return globalJsonParser(req, _res, next);
});
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// OIDC provider for LeadConnector SSO (must be before auth middleware)
app.use(oidcRouter);

// Setup authentication
setupAuth(app);

const authDeployMarker =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.RAILWAY_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.COMMIT_SHA ||
  "(no CI commit SHA — local or unset)";
console.log("[AUTH FIX DEPLOYED] raw email lookup active", { gitSha: authDeployMarker });

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

  // Ensure SSO user exists for LeadConnector integration
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

  // One-time deduplication: merge contacts that share the same normalised WhatsApp/phone number.
  // Safe to run on every startup — no-ops immediately when no duplicates exist.
  try {
    const { db } = await import("../drizzle/db");
    const { contacts, conversations } = await import("@shared/schema");
    const { eq, and, sql: rawSql, asc } = await import("drizzle-orm");

    const allContacts = await db.select().from(contacts);
    const groups = new Map<string, typeof allContacts>();
    for (const c of allContacts) {
      const raw = c.whatsappId || c.phone || '';
      if (!raw) continue;
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 7) continue; // skip obviously non-phone values
      const key = `${c.userId}::${digits}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }

    for (const [key, group] of groups.entries()) {
      if (group.length < 2) continue;

      // Count messages per contact
      const counts = await Promise.all(group.map(async (c) => {
        const rows = await db.execute(rawSql`
          SELECT COUNT(*) as cnt FROM messages m
          JOIN conversations cv ON m.conversation_id = cv.id
          WHERE cv.contact_id = ${c.id}
        `);
        return { contact: c, msgCount: Number((rows.rows[0] as any).cnt) };
      }));

      // Winner = most messages; tie-break: has whatsappId, then oldest
      counts.sort((a, b) => {
        if (b.msgCount !== a.msgCount) return b.msgCount - a.msgCount;
        if (a.contact.whatsappId && !b.contact.whatsappId) return -1;
        if (!a.contact.whatsappId && b.contact.whatsappId) return 1;
        return new Date(a.contact.createdAt!).getTime() - new Date(b.contact.createdAt!).getTime();
      });

      const winner = counts[0].contact;
      const losers = counts.slice(1).map(c => c.contact);
      const normalizedPhone = (winner.whatsappId || winner.phone || '').replace(/\D/g, '');

      const winnerConvs = await db.select().from(conversations)
        .where(and(eq(conversations.contactId, winner.id), eq(conversations.channel, 'whatsapp')))
        .orderBy(asc(conversations.createdAt)).limit(1);
      const winnerConv = winnerConvs[0] ?? null;

      for (const loser of losers) {
        const loserConvs = await db.select().from(conversations).where(eq(conversations.contactId, loser.id));
        for (const lc of loserConvs) {
          if (winnerConv) {
            await db.execute(rawSql`UPDATE messages SET conversation_id = ${winnerConv.id}, contact_id = ${winner.id} WHERE conversation_id = ${lc.id}`);
            await db.execute(rawSql`DELETE FROM conversations WHERE id = ${lc.id}`);
          } else {
            await db.execute(rawSql`UPDATE conversations SET contact_id = ${winner.id} WHERE id = ${lc.id}`);
            await db.execute(rawSql`UPDATE messages SET contact_id = ${winner.id} WHERE conversation_id = ${lc.id}`);
          }
        }
        await db.execute(rawSql`UPDATE activity_events SET contact_id = ${winner.id} WHERE contact_id = ${loser.id}`);
        await db.execute(rawSql`DELETE FROM contacts WHERE id = ${loser.id}`);
        console.log(`[Dedup] Merged duplicate contact ${loser.id} (${loser.name}) into ${winner.id} (${winner.name}) [${key}]`);
      }

      // Normalise winner phone/whatsapp_id to digits-only
      await db.execute(rawSql`UPDATE contacts SET phone = ${normalizedPhone}, whatsapp_id = ${normalizedPhone} WHERE id = ${winner.id}`);
    }
  } catch (dedupErr: any) {
    console.error('[Dedup] Contact deduplication error (non-fatal):', dedupErr.message);
  }

  // Start notification scheduler
  startNotificationScheduler();
  
  // Start cron jobs (trial check-in emails, etc.)
  startCronJobs();

  // Dev-only fallback polling for Instagram DMs (when webhooks aren't delivering)
  startInstagramDevPolling();

  // Start durable flow job worker (handles Wait/delay steps that survive restarts)
  const { startFlowJobWorker } = await import("./flowJobWorker");
  startFlowJobWorker();

  // IndexNow: detect new/changed content and submit to search engines on startup.
  // Uses a persisted state snapshot to submit only newly added blog posts and
  // landing pages. Falls back to submitting all pages when no prior state exists
  // (first deploy or ephemeral production filesystem after re-deploy).
  // Runs only in production; in dev the state file persists so only genuine
  // new additions trigger submissions.
  if (process.env.NODE_ENV === "production") {
    setTimeout(async () => {
      try {
        const { detectAndSubmitNewContent } = await import("./indexNow");
        await detectAndSubmitNewContent();
      } catch (err: any) {
        console.error("[IndexNow] Startup content detection failed:", err.message);
      }
    }, 10_000); // 10-second delay — lets server fully start before outbound requests
  }

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
      const appUrl = String(process.env.APP_URL || "").replace(/\/+$/, "");
      console.log(
        "[Meta Webhook] Meta App Dashboard callback URL must match:",
        `${appUrl || "(set APP_URL env)"}/api/webhook/meta`,
      );
      runStartupGhlCleanup().catch(err => console.error('[GHL Startup Cleanup] Unhandled error:', err));

      setTimeout(() => {
        (async () => {
          try {
            console.log("[Backfill] Starting startup backfills...");
            await (app as any).locals.runBackfills?.();
            console.log("[Backfill] Startup backfills completed");
          } catch (err) {
            console.error("[Backfill] Startup backfills failed:", err);
          }
        })().catch((err) => console.error("[Backfill] Startup backfills failed:", err));
      }, 0);
    },
  );
})();
