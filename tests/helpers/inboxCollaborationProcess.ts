import { prepareDbTestEnvironment } from "./dbTestGuard";
prepareDbTestEnvironment("Inbox collaboration child process");
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-test-key";
const { coordinatedSend, beforeInboxProviderDispatch } =
  await import("../../server/inboxSendCoordination");
const { db } = await import("../../drizzle/db");
const { messages } = await import("../../shared/schema");
const { sql } = await import("drizzle-orm");
const bus = await import("../../server/inboxRealtimeBus");
let release: (() => void) | undefined;
process.on("message", async (message: any) => {
  if (message.action === "release") {
    release?.();
    return;
  }
  try {
    if (message.action === "serve") {
      const express = (await import("express")).default,
        session = (await import("express-session")).default;
      const { rateLimit } = await import("express-rate-limit");
      const { createServer } = await import("node:http");
      const { once } = await import("node:events");
      const { setupAuth, authenticatePresenceRequest } =
        await import("../../server/auth");
      const { setupPresenceServer } = await import("../../server/presence");
      const { storage } = await import("../../server/storage");
      const app = express();
      app.use(express.json());
      setupAuth(app, { store: new session.MemoryStore() });
      app.post(
        "/__login",
        rateLimit({ windowMs: 60000, limit: 10 }),
        async (req, res, next) => {
          const user = await storage.getUserForSession(req.body.id);
          if (!user) return res.sendStatus(401);
          req.logIn(user, (error) =>
            error ? next(error) : res.json({ ok: true }),
          );
        },
      );
      const server = createServer(app);
      setupPresenceServer(server, authenticatePresenceRequest);
      const ready = bus.inboxBusConnected()
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const off = bus.onInboxBusReady(() => {
              off();
              resolve();
            });
          });
      bus.startInboxRealtimeBus();
      await ready;
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      process.send?.({
        id: message.id,
        ok: true,
        port: (server.address() as any).port,
      });
      return;
    }
    if (message.action === "subscribe") {
      bus.onInboxEvent((workspaceId, payload) =>
        process.send?.({ event: "bus", workspaceId, payload }),
      );
      const ready = bus.inboxBusConnected()
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const off = bus.onInboxBusReady(() => {
              off();
              resolve();
            });
          });
      bus.startInboxRealtimeBus();
      await ready;
      process.send?.({ id: message.id, ok: true });
      return;
    }
    if (message.action === "watch_abort") {
      const { registerWebchatGenerationAbort } =
        await import("../../server/webchatGenerationAbort");
      const controller = new AbortController();
      controller.signal.addEventListener("abort", () =>
        process.send?.({
          event: "generation_aborted",
          conversationId: message.conversationId,
        }),
      );
      registerWebchatGenerationAbort(message.conversationId, controller);
      process.send?.({ id: message.id, ok: true });
      return;
    }
    if (message.action === "publish") {
      bus.publishInboxEvent(message.workspaceId, message.payload);
      process.send?.({ id: message.id, ok: true });
      return;
    }
    const input = message.input;
    const result = await coordinatedSend(input, async () => {
      await beforeInboxProviderDispatch();
      await db.execute(
        sql`INSERT INTO codex_provider_deliveries(attempt_id) VALUES (${input.attemptId})`,
      );
      process.send?.({ event: "provider_started", id: message.id });
      if (message.crash) process.exit(0);
      if (message.timeout) throw new Error("provider_timeout_after_accept");
      if (message.hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      const [row] = await db
        .insert(messages)
        .values({
          userId: input.workspaceId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          direction: "outbound",
          content: String(input.payload.content),
          status: "sent",
          sentByUserId: input.actorId,
          generatedBy: input.ai ? "ai_brain" : "human",
        })
        .returning();
      return {
        success: true,
        messageId: row.id,
        conversationId: row.conversationId,
      };
    });
    process.send?.({ id: message.id, ok: true, result });
  } catch (error: any) {
    process.send?.({
      id: message.id,
      ok: false,
      code: error.code || error.message,
      status: error.status,
    });
  }
});
process.send?.({ event: "ready" });
