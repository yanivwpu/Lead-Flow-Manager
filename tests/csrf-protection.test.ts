import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import { once } from "node:events";
import { csrfProtection } from "../server/csrfProtection";

test("shared CSRF middleware protects cookie-backed writes without blocking cookie-free providers", async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection);
  let writes = 0;
  app.patch("/api/example", (_req, res) => { writes++; res.sendStatus(204); });
  app.post("/api/auth/login", (_req, res) => { writes++; res.sendStatus(204); });
  app.post("/api/webhook/provider", (_req, res) => { writes++; res.sendStatus(204); });
  app.get("/api/example", (_req, res) => res.sendStatus(204));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address unavailable");
  const origin = `http://127.0.0.1:${address.port}`;
  const session = "connect.sid=fixture-signed-session-a";
  const request = (path: string, method: string, headers: Record<string, string> = {}) =>
    fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...headers },
      ...(method === "GET" || method === "HEAD" ? {} : { body: "{}" }) });
  try {
    assert.equal((await request("/api/example", "GET", { Cookie: session, Origin: "https://foreign.example" })).status, 204);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session, Origin: "https://foreign.example" })).status, 403);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session, Origin: "null" })).status, 403);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session, "Sec-Fetch-Site": "same-site" })).status, 403);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session })).status, 403);
    assert.equal((await request("/api/auth/login", "POST", { Origin: "https://foreign.example" })).status, 403);
    assert.equal((await request("/api/security/csrf-token", "GET", { Cookie: session, Origin: "https://foreign.example" })).status, 403);
    assert.equal(writes, 0);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session, Origin: origin })).status, 204);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session, Referer: origin + "/app/inbox" })).status, 204);
    assert.equal((await request("/api/example", "PATCH", { Cookie: session, "Sec-Fetch-Site": "same-origin" })).status, 204);
    assert.equal((await request("/api/auth/login", "POST", { Origin: origin })).status, 204);
    assert.equal((await request("/api/webhook/provider", "POST", { "X-Provider-Signature": "fixture" })).status, 204);
    const tokenResponse = await request("/api/security/csrf-token", "GET", { Cookie: session });
    assert.equal(tokenResponse.status, 200);
    assert.equal(tokenResponse.headers.get("cache-control"), "no-store");
    const token = (await tokenResponse.json()).csrfToken as string;
    assert.match(token, /^[a-f0-9]{64}$/);
    const cookie = tokenResponse.headers.get("set-cookie") || "";
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    const tokenCookie = cookie.split(";")[0];
    const proof = { Cookie: session + "; " + tokenCookie, "X-CSRF-Token": token };
    assert.equal((await request("/api/example", "PATCH", proof)).status, 204);
    assert.equal((await request("/api/example", "PATCH", { ...proof, Origin: "https://foreign.example" })).status, 403);
    assert.equal((await request("/api/example", "PATCH", { ...proof, Cookie: "connect.sid=fixture-signed-session-b; " + tokenCookie })).status, 403);
    assert.equal((await request("/api/example", "PATCH", { ...proof, "X-CSRF-Token": "0".repeat(64) })).status, 403);
    assert.equal(writes, 6);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
