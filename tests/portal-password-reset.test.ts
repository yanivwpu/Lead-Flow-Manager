/**
 * Partner + Sales portal password reset coverage (unit + source contract).
 * Run: npx tsx tests/portal-password-reset.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import {
  PORTAL_PASSWORD_MIN_LENGTH,
  PORTAL_RESET_TTL_MS,
  allowPortalForgotRequest,
  clearPortalForgotRateLimitsForTests,
  isBcryptPasswordHash,
  normalizePortalEmail,
  validatePortalPassword,
} from "../server/portalPasswordReset";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

{
  assert.equal(normalizePortalEmail("  Alex@Example.COM "), "alex@example.com");
  assert.equal(validatePortalPassword("12345"), `Password must be at least ${PORTAL_PASSWORD_MIN_LENGTH} characters`);
  assert.equal(validatePortalPassword("123456"), null);
  assert.equal(PORTAL_RESET_TTL_MS, 60 * 60 * 1000);
}

{
  clearPortalForgotRateLimitsForTests();
  for (let i = 0; i < 5; i++) assert.equal(allowPortalForgotRequest("email:partner:a@b.com"), true);
  assert.equal(allowPortalForgotRequest("email:partner:a@b.com"), false);
  // Separate portal buckets
  assert.equal(allowPortalForgotRequest("email:salesperson:a@b.com"), true);
}

{
  // Token lifecycle simulation (store hash only; single-use; expiry; type scoped)
  type Row = {
    accountType: "partner" | "salesperson";
    accountId: string;
    tokenHash: string;
    expiresAt: number;
    usedAt: number | null;
  };
  const rows: Row[] = [];
  const issue = (accountType: Row["accountType"], accountId: string) => {
    for (const r of rows) {
      if (r.accountType === accountType && r.accountId === accountId && !r.usedAt && r.expiresAt > Date.now()) {
        r.usedAt = Date.now();
      }
    }
    const raw = crypto.randomBytes(32).toString("hex");
    rows.push({
      accountType,
      accountId,
      tokenHash: hashToken(raw),
      expiresAt: Date.now() + PORTAL_RESET_TTL_MS,
      usedAt: null,
    });
    return raw;
  };
  const consume = (
    accountType: Row["accountType"],
    raw: string,
  ): "ok" | "invalid" | "used" | "expired" | "wrong_type" => {
    const h = hashToken(raw);
    const row = rows.find((r) => r.tokenHash === h);
    if (!row) return "invalid";
    if (row.accountType !== accountType) return "wrong_type";
    if (row.usedAt) return "used";
    if (row.expiresAt <= Date.now()) return "expired";
    row.usedAt = Date.now();
    return "ok";
  };

  const partnerToken = issue("partner", "p1");
  const salesToken = issue("salesperson", "s1");
  assert.equal(consume("salesperson", partnerToken), "wrong_type");
  assert.equal(consume("partner", salesToken), "wrong_type");
  assert.equal(consume("partner", partnerToken), "ok");
  assert.equal(consume("partner", partnerToken), "used");

  const t2 = issue("partner", "p1");
  const t3 = issue("partner", "p1"); // invalidates t2
  assert.equal(consume("partner", t2), "used");
  assert.equal(consume("partner", t3), "ok");

  const expiredRaw = crypto.randomBytes(32).toString("hex");
  rows.push({
    accountType: "partner",
    accountId: "p2",
    tokenHash: hashToken(expiredRaw),
    expiresAt: Date.now() - 1000,
    usedAt: null,
  });
  assert.equal(consume("partner", expiredRaw), "expired");
  assert.equal(consume("partner", "not-a-real-token"), "invalid");
}

{
  // Password hashing stays bcrypt cost 10 (same as partner login)
  const hash = await bcrypt.hash("new-secret", 10);
  assert.ok(await bcrypt.compare("new-secret", hash));
  assert.equal(await bcrypt.compare("old-secret", hash), false);
  assert.equal(isBcryptPasswordHash(null), false);
  assert.equal(isBcryptPasswordHash(undefined), false);
  assert.equal(isBcryptPasswordHash("123456"), false);
  assert.equal(isBcryptPasswordHash(hash), true);

  // Sales login isolation: 6-digit codes must not enter bcrypt path
  async function resolveSalesAuth(
    credential: string,
    row: { loginCode: string; passwordHash: string | null },
  ): Promise<"code" | "password" | null> {
    if (credential === row.loginCode) return "code";
    if (isBcryptPasswordHash(row.passwordHash)) {
      if (await bcrypt.compare(credential, row.passwordHash!)) return "password";
    }
    return null;
  }
  const beforeReset = { loginCode: "654321", passwordHash: null as string | null };
  assert.equal(await resolveSalesAuth("654321", beforeReset), "code");
  assert.equal(await resolveSalesAuth("any-password", beforeReset), null);

  const afterReset = {
    loginCode: "999888",
    passwordHash: await bcrypt.hash("fresh-pass", 10),
  };
  assert.equal(await resolveSalesAuth("654321", afterReset), null); // old code dead
  assert.equal(await resolveSalesAuth("999888", afterReset), "code"); // rotated code still works
  assert.equal(await resolveSalesAuth("fresh-pass", afterReset), "password");
}

{
  const root = join(import.meta.dirname, "..");
  const routes = readFileSync(join(root, "server/routes/portalPasswordResetRoutes.ts"), "utf8");
  assert.ok(routes.includes('/api/partner-portal/forgot-password'));
  assert.ok(routes.includes('/api/partner-portal/reset-password'));
  assert.ok(routes.includes('/api/sales-portal/forgot-password'));
  assert.ok(routes.includes('/api/sales-portal/reset-password'));
  assert.ok(routes.includes('/api/admin/partners/:id/send-password-reset'));
  assert.ok(routes.includes('/api/admin/salespeople/:id/send-password-reset'));
  assert.ok(routes.includes("If a partner account exists for this email"));
  assert.ok(routes.includes("If a sales account exists for this email"));

  const service = readFileSync(join(root, "server/portalPasswordReset.ts"), "utf8");
  assert.ok(service.includes('row.accountType !== params.accountType'));
  assert.ok(service.includes("passwordHash"));
  assert.ok(service.includes("generateUniqueLoginCode"));
  assert.ok(!/console\.log\([^\)]*token/i.test(service));
  assert.ok(!/console\.log\([^\)]*password/i.test(service));

  const email = readFileSync(join(root, "server/email.ts"), "utf8");
  assert.ok(email.includes("Reset your WhachatCRM Partner Portal password"));
  assert.ok(email.includes("Reset your WhachatCRM Sales Portal password"));
  assert.ok(email.includes("/partner-portal/reset-password?token="));
  assert.ok(email.includes("/sales-portal/reset-password?token="));
  assert.ok(email.includes("APP_URL"));

  const migration = readFileSync(
    join(root, "migrations/0070_portal_password_reset_tokens.sql"),
    "utf8",
  );
  assert.ok(migration.includes("portal_password_reset_tokens"));
  assert.ok(migration.includes("password_hash"));
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS"));

  const partnerUi = readFileSync(join(root, "client/src/pages/PartnerPortal.tsx"), "utf8");
  assert.ok(partnerUi.includes("/partner-portal/forgot-password"));
  assert.ok(partnerUi.includes("Forgot password?"));

  const salesUi = readFileSync(join(root, "client/src/pages/SalesPortal.tsx"), "utf8");
  assert.ok(salesUi.includes("/sales-portal/forgot-password"));
  assert.ok(salesUi.includes("Forgot password?"));

  const adminUi = readFileSync(join(root, "client/src/pages/Admin.tsx"), "utf8");
  assert.ok(adminUi.includes("Send password reset email"));
  assert.ok(adminUi.includes("/api/admin/partners/"));
  assert.ok(adminUi.includes("/api/admin/salespeople/"));

  const spa = readFileSync(join(root, "server/spaRouting.ts"), "utf8");
  assert.ok(spa.includes("/partner-portal/forgot-password"));
  assert.ok(spa.includes("/sales-portal/reset-password"));

  const salesLogin = readFileSync(join(root, "server/routes.ts"), "utf8");
  assert.ok(salesLogin.includes("passwordHash"));
  assert.ok(salesLogin.includes("registerPortalPasswordResetRoutes"));
}

console.log("portal-password-reset.test.ts: all assertions passed");
