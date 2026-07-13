/**
 * Native Email Phase 1B — Gmail push + watch + coalescing unit tests (no live Gmail).
 * Run: npx tsx tests/gmail-push-phase-1b.test.ts
 */
import assert from "node:assert/strict";
import {
  EMAIL_POLL_FALLBACK_INTERVAL_MS,
  preferNewerHistoryId,
  resolveGmailPubSubConfig,
  logGmailPushE2EEvent,
} from "../server/emailChannel/gmailPushConfig";
import { assertPubSubJwtClaims } from "../server/emailChannel/gmailPubSubAuth";
import { shouldRenewGmailWatch } from "../server/emailChannel/gmailWatch";
import { resolveEmailSyncMode } from "../server/emailChannel/oauth";
import { GmailEmailProvider } from "../server/emailChannel/gmailProvider";
import { GMAIL_OAUTH_SCOPES } from "../shared/emailChannel";

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

async function main() {
  await run("gmail.readonly remains sufficient for users.watch (no scope expansion)", () => {
    assert.ok(GMAIL_OAUTH_SCOPES.includes("https://www.googleapis.com/auth/gmail.readonly"));
    assert.ok(GMAIL_OAUTH_SCOPES.includes("https://www.googleapis.com/auth/gmail.send"));
    assert.ok(!GMAIL_OAUTH_SCOPES.some((s) => s.includes("gmail.modify") || s.includes("mail.google.com")));
  });

  await run("missing GMAIL_PUBSUB_TOPIC → not configured (app still boots / polling ok)", () => {
    const prev = process.env.GMAIL_PUBSUB_TOPIC;
    delete process.env.GMAIL_PUBSUB_TOPIC;
    const cfg = resolveGmailPubSubConfig();
    assert.equal(cfg.configured, false);
    if (prev !== undefined) process.env.GMAIL_PUBSUB_TOPIC = prev;
  });

  await run("valid Pub/Sub env resolves FQ topic + audience + SA", () => {
    process.env.GMAIL_PUBSUB_TOPIC = "projects/demo-proj/topics/gmail-mailbox-updates";
    process.env.GMAIL_PUBSUB_AUDIENCE = "https://app.whachatcrm.com/api/webhooks/gmail/pubsub";
    process.env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT = "whachatcrm-gmail-push@demo-proj.iam.gserviceaccount.com";
    const cfg = resolveGmailPubSubConfig();
    assert.equal(cfg.configured, true);
    if (cfg.configured) {
      assert.equal(cfg.topicName, "projects/demo-proj/topics/gmail-mailbox-updates");
      assert.match(cfg.audience, /\/api\/webhooks\/gmail\/pubsub$/);
    }
  });

  await run("users.watch request uses topicName + Bearer access token", async () => {
    const provider = new GmailEmailProvider();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ historyId: "999001", expiration: String(Date.now() + 7 * 86400_000) }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const result = await provider.watchMailbox({
        accessToken: "ya29.test-token",
        topicName: "projects/demo-proj/topics/gmail-mailbox-updates",
      });
      assert.equal(result.historyId, "999001");
      assert.ok(result.expiration instanceof Date);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/gmail\/v1\/users\/me\/watch$/);
      assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer ya29.test-token");
      const body = JSON.parse(String(calls[0].init?.body || "{}"));
      assert.equal(body.topicName, "projects/demo-proj/topics/gmail-mailbox-updates");
    } finally {
      globalThis.fetch = original;
    }
  });

  await run("active non-expiring watch → no renew needed", () => {
    const far = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    assert.equal(shouldRenewGmailWatch(far), false);
  });

  await run("watch nearing expiration / missing → renew", () => {
    assert.equal(shouldRenewGmailWatch(null), true);
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000);
    assert.equal(shouldRenewGmailWatch(soon), true);
  });

  await run("out-of-order notification historyId never moves backward", () => {
    assert.equal(preferNewerHistoryId("100", "90"), "100");
    assert.equal(preferNewerHistoryId("100", "110"), "110");
    assert.equal(preferNewerHistoryId(null, "50"), "50");
    assert.equal(preferNewerHistoryId("50", null), "50");
  });

  await run("Pub/Sub JWT claims: missing issuer / wrong audience / wrong SA rejected", () => {
    const audience = "https://app.whachatcrm.com/api/webhooks/gmail/pubsub";
    const sa = "whachatcrm-gmail-push@demo.iam.gserviceaccount.com";
    assert.equal(
      assertPubSubJwtClaims({
        payload: { iss: "evil", email: sa, aud: audience },
        audience,
        pushServiceAccount: sa,
      }).ok,
      false,
    );
    assert.equal(
      assertPubSubJwtClaims({
        payload: { iss: "https://accounts.google.com", email: sa, aud: "https://other" },
        audience,
        pushServiceAccount: sa,
      }).ok,
      false,
    );
    const wrongSa = assertPubSubJwtClaims({
      payload: {
        iss: "https://accounts.google.com",
        email: "other@demo.iam.gserviceaccount.com",
        aud: audience,
      },
      audience,
      pushServiceAccount: sa,
    });
    assert.equal(wrongSa.ok, false);
    if (!wrongSa.ok) assert.equal(wrongSa.reason, "wrong_service_account");
  });

  await run("Pub/Sub JWT claims: valid issuer+audience+SA accepted", () => {
    const audience = "https://app.whachatcrm.com/api/webhooks/gmail/pubsub";
    const sa = "whachatcrm-gmail-push@demo.iam.gserviceaccount.com";
    const ok = assertPubSubJwtClaims({
      payload: { iss: "https://accounts.google.com", email: sa, aud: audience, email_verified: true },
      audience,
      pushServiceAccount: sa,
    });
    assert.equal(ok.ok, true);
  });

  await run("invalid base64/json payload decode fails safely", () => {
    assert.throws(() => JSON.parse(Buffer.from("%%%", "base64").toString("utf8")));
    const good = JSON.parse(
      Buffer.from(JSON.stringify({ emailAddress: "a@b.com", historyId: "1" }), "utf8").toString(
        "utf8",
      ),
    );
    assert.equal(good.emailAddress, "a@b.com");
  });

  await run("Settings sync mode: active watch → realtime; else polling fallback", () => {
    const rt = resolveEmailSyncMode({
      gmailWatchStatus: "active",
      gmailWatchExpiration: new Date(Date.now() + 86400_000),
    });
    assert.equal(rt.syncMode, "realtime");
    assert.match(rt.syncModeLabel, /Near-real-time/i);

    const poll = resolveEmailSyncMode({
      gmailWatchStatus: "error",
      gmailWatchExpiration: null,
    });
    assert.equal(poll.syncMode, "polling_fallback");
    assert.match(poll.syncModeLabel, /Polling fallback/i);

    const unset = resolveEmailSyncMode({
      gmailWatchStatus: "not_configured",
      gmailWatchExpiration: null,
    });
    assert.equal(unset.syncMode, "polling_fallback");
  });

  await run("polling fallback uses elapsed-time interval (not exact UTC minute)", () => {
    assert.ok(EMAIL_POLL_FALLBACK_INTERVAL_MS >= 5 * 60 * 1000);
    // Default Phase 1B: 10 minutes
    assert.equal(EMAIL_POLL_FALLBACK_INTERVAL_MS, 10 * 60 * 1000);
  });

  await run("auth without bearer returns 401 category", async () => {
    process.env.GMAIL_PUBSUB_TOPIC = "projects/demo-proj/topics/gmail-mailbox-updates";
    process.env.GMAIL_PUBSUB_AUDIENCE = "https://app.whachatcrm.com/api/webhooks/gmail/pubsub";
    process.env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT = "whachatcrm-gmail-push@demo-proj.iam.gserviceaccount.com";
    const { authenticateGmailPubSubRequest } = await import("../server/emailChannel/gmailPubSubAuth");
    const missing = await authenticateGmailPubSubRequest(undefined);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 401);
      assert.equal(missing.reason, "missing_bearer");
    }
    const badJwt = await authenticateGmailPubSubRequest("Bearer not.a.jwt");
    assert.equal(badJwt.ok, false);
    if (!badJwt.ok) assert.equal(badJwt.status, 401);
  });

  await run("GmailPushE2E logger emits Railway-required message field", () => {
    const lines: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = ((msg?: unknown) => {
      lines.push(String(msg));
    }) as typeof console.log;
    console.error = ((msg?: unknown) => {
      lines.push(String(msg));
    }) as typeof console.error;
    try {
      logGmailPushE2EEvent("route_registered", { path: "/api/webhooks/gmail/pubsub" });
      const structured = lines.find((l) => l.startsWith("{") && l.includes("GmailPushE2E"));
      assert.ok(structured, "expected structured JSON log line");
      const parsed = JSON.parse(structured!);
      assert.equal(parsed.message, "[GmailPushE2E] route_registered");
      assert.equal(parsed.tag, "[GmailPushE2E]");
      assert.equal(parsed.event, "route_registered");
      assert.ok(lines.some((l) => l === "[GmailPushE2E] route_registered"));
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  });

  console.log("\nAll Gmail Phase 1B unit tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
