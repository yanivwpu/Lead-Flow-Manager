/**
 * Real HTTP Siteverify contract — not a mocked fetch assertion.
 * Run: npx tsx --test tests/auth-turnstile-siteverify-http.test.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TURNSTILE_SIGNUP_ACTION,
  TURNSTILE_TEST_SECRET_KEY,
  TURNSTILE_TEST_SITE_KEY,
  verifyTurnstileToken,
} from "../server/authTurnstile";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

type CapturedRequest = {
  method?: string;
  contentType?: string;
  rawBody: string;
  fields: URLSearchParams;
};

function withEnv(patch: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const next = patch[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(patch)) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    });
}

function startFakeSiteverify(
  handler: (captured: CapturedRequest, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        handler(
          {
            method: req.method,
            contentType: req.headers["content-type"],
            rawBody,
            fields: new URLSearchParams(rawBody),
          },
          res,
        );
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("fake Siteverify server failed to bind"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/turnstile/v0/siteverify`,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

function assertOfficialWire(captured: CapturedRequest, expected: { secret: string; token: string }) {
  assert.equal(captured.method, "POST");
  assert.equal(captured.contentType, "application/x-www-form-urlencoded");
  assert.equal(typeof captured.rawBody, "string");
  assert.doesNotMatch(captured.rawBody, /undefined/);
  assert.doesNotMatch(captured.rawBody, /(?:^|&)action=/);
  assert.equal(captured.fields.get("secret"), expected.secret);
  assert.equal(captured.fields.get("response"), expected.token);
  assert.equal(captured.fields.get("action"), null);
  assert.match(captured.rawBody, /secret=/);
  assert.match(captured.rawBody, /response=/);
}

test("fake Siteverify server receives the official form-urlencoded POST", async () => {
  const secret = "live-secret-not-test-key";
  const token = "browser-issued-token-1";
  let captured: CapturedRequest | undefined;
  const server = await startFakeSiteverify((req, res) => {
    captured = req;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        hostname: "app.whachatcrm.com",
        action: TURNSTILE_SIGNUP_ACTION,
      }),
    );
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: secret,
    },
    async () => {
      try {
        const result = await verifyTurnstileToken(token, "unknown", {
          siteverifyUrl: server.url,
          idempotencyKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        });
        assert.equal(result.ok, true);
        assert.ok(captured);
        assertOfficialWire(captured, { secret, token });
        assert.equal(captured.fields.get("remoteip"), null);
        assert.equal(captured.fields.get("idempotency_key"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
      } finally {
        await server.close();
      }
    },
  );
});

test("optional remoteip is encoded only when it is a real IP", async () => {
  const secret = "live-secret-not-test-key";
  let captured: CapturedRequest | undefined;
  const server = await startFakeSiteverify((req, res) => {
    captured = req;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        hostname: "www.whachatcrm.com",
        action: TURNSTILE_SIGNUP_ACTION,
      }),
    );
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: secret,
    },
    async () => {
      try {
        const result = await verifyTurnstileToken("tok-2", "203.0.113.44", { siteverifyUrl: server.url });
        assert.equal(result.ok, true);
        assert.ok(captured);
        assertOfficialWire(captured, { secret, token: "tok-2" });
        assert.equal(captured.fields.get("remoteip"), "203.0.113.44");
      } finally {
        await server.close();
      }
    },
  );
});

test("non-2xx Siteverify parses only sanitized error-codes", async () => {
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  const server = await startFakeSiteverify((_req, res) => {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        "error-codes": ["bad-request", "steal-this-secret", "invalid-input-secret"],
        secret: "do-not-log",
      }),
    );
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
    },
    async () => {
      try {
        const result = await verifyTurnstileToken("tok-400", "8.8.8.8", { siteverifyUrl: server.url });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "network");
        const serialized = JSON.stringify(warnings);
        assert.match(serialized, /bad-request/);
        assert.match(serialized, /invalid-input-secret/);
        assert.doesNotMatch(serialized, /steal-this-secret/);
        assert.doesNotMatch(serialized, /do-not-log/);
        assert.doesNotMatch(serialized, /tok-400/);
        assert.doesNotMatch(serialized, /live-secret-not-test-key/);
        assert.doesNotMatch(serialized, /8\.8\.8\.8/);
      } finally {
        console.warn = originalWarn;
        await server.close();
      }
    },
  );
});

test("malformed JSON Siteverify response is fail-closed without leaking the body", async () => {
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  const server = await startFakeSiteverify((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("not-json{");
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
    },
    async () => {
      try {
        const result = await verifyTurnstileToken("tok-malformed", null, { siteverifyUrl: server.url });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "invalid");
        const serialized = JSON.stringify(warnings);
        assert.doesNotMatch(serialized, /not-json/);
        assert.doesNotMatch(serialized, /tok-malformed/);
      } finally {
        console.warn = originalWarn;
        await server.close();
      }
    },
  );
});

test("invalid hostname and action are rejected after a successful Cloudflare success flag", async () => {
  let mode: "host" | "action" = "host";
  const server = await startFakeSiteverify((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        mode === "host"
          ? { success: true, hostname: "evil.example", action: TURNSTILE_SIGNUP_ACTION }
          : { success: true, hostname: "app.whachatcrm.com", action: "login" },
      ),
    );
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
    },
    async () => {
      try {
        const host = await verifyTurnstileToken("tok-host", null, { siteverifyUrl: server.url });
        assert.equal(host.ok, false);
        if (!host.ok) assert.equal(host.reason, "hostname");

        mode = "action";
        const action = await verifyTurnstileToken("tok-action", null, { siteverifyUrl: server.url });
        assert.equal(action.ok, false);
        if (!action.ok) assert.equal(action.reason, "action");
      } finally {
        await server.close();
      }
    },
  );
});

test("expired or replayed tokens are rejected", async () => {
  const server = await startFakeSiteverify((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] }));
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
      TURNSTILE_SECRET_KEY: "live-secret-not-test-key",
    },
    async () => {
      try {
        const result = await verifyTurnstileToken("used-once-already", null, { siteverifyUrl: server.url });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "invalid");
      } finally {
        await server.close();
      }
    },
  );
});

test("quoted production secrets are normalized before the wire request", async () => {
  let captured: CapturedRequest | undefined;
  const server = await startFakeSiteverify((req, res) => {
    captured = req;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        hostname: "whachatcrm.com",
        action: TURNSTILE_SIGNUP_ACTION,
      }),
    );
  });

  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: `"${TURNSTILE_TEST_SITE_KEY}"`,
      TURNSTILE_SECRET_KEY: '"quoted-live-secret"',
    },
    async () => {
      try {
        const result = await verifyTurnstileToken("tok-quoted", null, { siteverifyUrl: server.url });
        assert.equal(result.ok, true);
        assert.ok(captured);
        assert.equal(captured.fields.get("secret"), "quoted-live-secret");
      } finally {
        await server.close();
      }
    },
  );
});

test("missing production keys remain fail-closed and excluded flows stay ungated", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      VITE_TURNSTILE_SITE_KEY: undefined,
      TURNSTILE_SECRET_KEY: undefined,
    },
    async () => {
      const missing = await verifyTurnstileToken("any-token");
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.equal(missing.reason, "misconfigured");
    },
  );

  const auth = read("server/auth.ts");
  const loginSlice = auth.slice(auth.indexOf("app.post('/api/auth/login'"), auth.indexOf("app.post('/api/auth/logout'"));
  assert.doesNotMatch(loginSlice, /verifyTurnstileToken/);
  const shopify = read("server/shopifyRoutes.ts");
  assert.doesNotMatch(shopify, /verifyTurnstileToken/);
  const ghl = read("server/ghlRoutes.ts");
  assert.doesNotMatch(ghl, /verifyTurnstileToken/);
  const team = read("server/routes.ts");
  const invite = team.slice(team.indexOf('app.post("/api/team"'), team.indexOf('app.delete("/api/team/:id"'));
  assert.doesNotMatch(invite, /verifyTurnstileToken/);
});
