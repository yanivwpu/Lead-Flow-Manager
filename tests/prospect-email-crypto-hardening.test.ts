/**
 * Prospect AI / Gmail crypto hardening (fail-closed, rebind, decrypt re-probe, single-flight).
 * Run: npx tsx tests/prospect-email-crypto-hardening.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertEmailEncryptionConfigured,
  clearMailboxTokenSingleFlightForTests,
  decryptEmailCredential,
  emailEncryptionKeySourceDiag,
  encryptEmailCredential,
  runMailboxTokenSingleFlight,
} from "../server/emailChannel/credentials";
import {
  decideSenderDecryptInfraPause,
  formatSenderNotConnectedDiagnostic,
  parseSenderNotConnectedDiagnostic,
} from "../shared/prospectSenderProbeDiagnostics";
import { formatProspectQueueItemError } from "../shared/prospectBulkOutreach";

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
  const prevNodeEnv = process.env.NODE_ENV;
  const prevEmailKey = process.env.EMAIL_ENCRYPTION_KEY;
  const prevSession = process.env.SESSION_SECRET;

  await run("production missing EMAIL_ENCRYPTION_KEY fails closed", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = "session-secret-should-not-be-used-in-prod!!";
    const diag = emailEncryptionKeySourceDiag();
    assert.equal(diag.present, false);
    assert.equal(diag.source, null);
    assert.equal(diag.productionFailClosed, true);
    assert.throws(
      () => assertEmailEncryptionConfigured(),
      /EMAIL_ENCRYPTION_KEY|not configured|does not fall back to SESSION_SECRET/i,
    );
    assert.throws(() => encryptEmailCredential("ya29.x"), /EMAIL_ENCRYPTION_KEY|not configured/i);
  });

  await run("no production fallback to SESSION_SECRET", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = "session-secret-should-not-be-used-in-prod!!";
    process.env.META_ENCRYPTION_KEY = "meta-key-also-ignored-in-production!!!!";
    assert.throws(() => encryptEmailCredential("ya29.x"), /EMAIL_ENCRYPTION_KEY|not configured/i);
    const diag = emailEncryptionKeySourceDiag();
    assert.notEqual(diag.source, "SESSION_SECRET");
    assert.notEqual(diag.source, "META_ENCRYPTION_KEY");
  });

  await run("fresh encrypt/decrypt works with EMAIL_ENCRYPTION_KEY", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_ENCRYPTION_KEY = "prod-email-encryption-key-32bytes!!";
    const enc = encryptEmailCredential("ya29.fresh-token");
    assert.equal(decryptEmailCredential(enc), "ya29.fresh-token");
    const diag = emailEncryptionKeySourceDiag();
    assert.equal(diag.source, "EMAIL_ENCRYPTION_KEY");
    assert.ok(diag.sha256Prefix8);
  });

  await run("persist sender_not_connected:decrypt:access_token", () => {
    const persisted = formatSenderNotConnectedDiagnostic("decrypt");
    assert.equal(persisted, "sender_not_connected:decrypt:access_token");
    assert.equal(
      formatSenderNotConnectedDiagnostic("decrypt", "refresh_token"),
      "sender_not_connected:decrypt:refresh_token",
    );
    const parsed = parseSenderNotConnectedDiagnostic(persisted);
    assert.equal(parsed.failureClass, "decrypt");
    assert.equal(parsed.decryptField, "access_token");
    assert.equal(
      formatProspectQueueItemError(persisted),
      "Connect an email account before starting the campaign",
    );
  });

  await run("one decrypt failure + successful retry does not pause", async () => {
    let calls = 0;
    const decision = await decideSenderDecryptInfraPause({
      failureClass: "decrypt",
      decryptField: "access_token",
      mailboxId: "mb-1",
      reprobe: async () => {
        calls += 1;
      },
    });
    assert.equal(calls, 1);
    assert.equal(decision.pause, false);
    assert.equal(decision.recovered, true);
    assert.equal(decision.persistReason, "sender_not_connected:decrypt:access_token");
  });

  await run("two consecutive decrypt failures still pause", async () => {
    let calls = 0;
    const decision = await decideSenderDecryptInfraPause({
      failureClass: "decrypt",
      decryptField: "access_token",
      mailboxId: "mb-1",
      reprobe: async () => {
        calls += 1;
        throw new Error("still decrypt fail");
      },
    });
    assert.equal(calls, 1);
    assert.equal(decision.pause, true);
    assert.equal(decision.recovered, false);
  });

  await run("non-decrypt failures do not re-probe", async () => {
    let calls = 0;
    const decision = await decideSenderDecryptInfraPause({
      failureClass: "api_auth",
      mailboxId: "mb-1",
      reprobe: async () => {
        calls += 1;
      },
    });
    assert.equal(calls, 0);
    assert.equal(decision.pause, true);
    assert.equal(decision.persistReason, "sender_not_connected:api_auth");
  });

  await run("concurrent refresh is single-flight", async () => {
    clearMailboxTokenSingleFlightForTests();
    let runs = 0;
    const slow = () =>
      runMailboxTokenSingleFlight("mb-flight", async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 30));
        return "ok";
      });
    const [a, b, c] = await Promise.all([slow(), slow(), slow()]);
    assert.equal(a, "ok");
    assert.equal(b, "ok");
    assert.equal(c, "ok");
    assert.equal(runs, 1);
    clearMailboxTokenSingleFlightForTests();
  });

  await run("stale senderMailboxId rebind is wired on Resume/Start path", () => {
    const queueSrc = readFileSync(
      join(process.cwd(), "server/prospectImport/prospectOutreachQueueService.ts"),
      "utf8",
    );
    assert.ok(queueSrc.includes("rebindStaleQueuedSenderMailboxes"));
    assert.ok(queueSrc.includes("sender_mailbox_rebound"));
    assert.ok(queueSrc.includes("decideSenderDecryptInfraPause"));
    assert.ok(queueSrc.includes("rescheduleQueuedOutreachItems"));
  });

  await run("boot crypto diag is invoked from server index", () => {
    const indexSrc = readFileSync(join(process.cwd(), "server/index.ts"), "utf8");
    assert.ok(indexSrc.includes("logEmailCryptoBootDiag"));
  });

  // restore env
  if (prevNodeEnv == null) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNodeEnv;
  if (prevEmailKey == null) delete process.env.EMAIL_ENCRYPTION_KEY;
  else process.env.EMAIL_ENCRYPTION_KEY = prevEmailKey;
  if (prevSession == null) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = prevSession;

  console.log("\nAll prospect-email-crypto-hardening tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
