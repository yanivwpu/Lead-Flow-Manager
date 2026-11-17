import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createInboxContentReadLimiter } from "../server/inboxContentRateLimit";
import { __resetRateLimitMemoryForTests } from "../server/rateLimitMiddleware";

test("content limiter shares routes, separates trusted actors, counts failed attempts and resets", async () => {
  __resetRateLimitMemoryForTests();
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const windowMs = 60_000;
  const limiter = createInboxContentReadLimiter(2, windowMs);
  let accesses = 0;
  const servers: ReturnType<typeof createServer>[] = [];
  try {
    const start = async (actor?: string) => {
      const app = express();
      // Trusted fixture identities, never supplied by headers, paths or query strings.
      app.use((req, _res, next) => { if (actor) req.user = { id: actor } as Express.User; next(); });
      app.get(["/media", "/email"], limiter, (_req, res) => { accesses++; res.status(404).json({ error: "Not found" }); });
      const server = createServer(app); servers.push(server);
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      return `http://127.0.0.1:${(server.address() as any).port}`;
    };
    const a = await start("actor-a"), b = await start("actor-b");
    assert.equal((await fetch(a + "/media?id=one")).status, 404);
    assert.equal((await fetch(a + "/email?id=two")).status, 404);
    const blocked = await fetch(a + "/media?workspaceId=other&userId=actor-b", { headers: { "x-user-id": "actor-b" } });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.equal((await blocked.json()).code, "RATE_LIMITED");
    assert.equal(accesses, 2, "429 must not run the protected handler");
    assert.equal((await fetch(b + "/media")).status, 404, "teammates sharing one IP have independent actor budgets");
    now += windowMs;
    assert.equal((await fetch(a + "/email")).status, 404, "next window restores access");
    const anon = await start();
    assert.equal((await fetch(anon + "/media")).status, 404);
    assert.equal((await fetch(anon + "/media")).status, 404);
    assert.equal((await fetch(anon + "/email", { headers: { "x-forwarded-for": "198.51.100.8" } })).status, 429,
      "untrusted forwarded headers cannot select another anonymous budget");
  } finally {
    Date.now = realNow;
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    __resetRateLimitMemoryForTests();
  }
});
