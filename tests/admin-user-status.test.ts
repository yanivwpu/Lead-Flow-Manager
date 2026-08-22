/**
 * Sales Admin Users status is display-only and verification-aware.
 * Run: npx tsx tests/admin-user-status.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminUserMatchesStatusFilter,
  adminUserStatusLabel,
  deriveAdminUserStatus,
} from "../shared/adminUserStatus";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const UNVERIFIED = {
  emailVerificationStatus: "awaiting_verification" as const,
  emailVerifiedAt: null,
  isInTrial: false,
  subscriptionStatus: "active",
  billingPlan: "free",
};

run("A. New unverified signup → Awaiting verification, not Active, not trial", () => {
  assert.equal(deriveAdminUserStatus(UNVERIFIED), "awaiting_verification");
  assert.equal(adminUserStatusLabel("awaiting_verification"), "Awaiting verification");
  assert.notEqual(deriveAdminUserStatus(UNVERIFIED), "active");
  assert.equal(UNVERIFIED.isInTrial, false);
});

run("A2. Unverified with only null emailVerifiedAt (no status field) is awaiting", () => {
  assert.equal(
    deriveAdminUserStatus({
      emailVerifiedAt: null,
      isInTrial: false,
      subscriptionStatus: "active",
      billingPlan: "free",
    }),
    "awaiting_verification",
  );
});

run("A3. Unverified still awaiting even if isInTrial were true (display priority)", () => {
  assert.equal(
    deriveAdminUserStatus({
      ...UNVERIFIED,
      isInTrial: true,
    }),
    "awaiting_verification",
  );
});

run("B. After email verification with active trial → Trial", () => {
  assert.equal(
    deriveAdminUserStatus({
      emailVerificationStatus: "verified",
      emailVerifiedAt: "2026-08-22T00:00:00.000Z",
      isInTrial: true,
      subscriptionStatus: "active",
      billingPlan: "free",
    }),
    "trial",
  );
});

run("C. Active paid verified user → Active", () => {
  assert.equal(
    deriveAdminUserStatus({
      emailVerificationStatus: "verified",
      emailVerifiedAt: "2026-08-22T00:00:00.000Z",
      isInTrial: false,
      subscriptionStatus: "active",
      billingPlan: "pro",
    }),
    "active",
  );
});

run("D. Expired verified user → Expired", () => {
  assert.equal(
    deriveAdminUserStatus({
      emailVerificationStatus: "verified",
      emailVerifiedAt: "2026-08-22T00:00:00.000Z",
      isInTrial: false,
      subscriptionStatus: "canceled",
      billingPlan: "free",
    }),
    "expired",
  );
  assert.equal(
    deriveAdminUserStatus({
      emailVerificationStatus: "verified",
      emailVerifiedAt: "2026-08-22T00:00:00.000Z",
      isInTrial: false,
      subscriptionStatus: "past_due",
      billingPlan: "pro",
    }),
    "expired",
  );
});

run("E. Active filter excludes unverified users", () => {
  assert.equal(adminUserMatchesStatusFilter(UNVERIFIED, "active"), false);
  assert.equal(
    adminUserMatchesStatusFilter(
      {
        emailVerificationStatus: "verified",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        isInTrial: false,
        subscriptionStatus: "active",
        billingPlan: "pro",
      },
      "active",
    ),
    true,
  );
});

run("F. Awaiting verification filter includes unverified only", () => {
  assert.equal(adminUserMatchesStatusFilter(UNVERIFIED, "awaiting_verification"), true);
  assert.equal(adminUserMatchesStatusFilter(UNVERIFIED, "all"), true);
  assert.equal(
    adminUserMatchesStatusFilter(
      {
        emailVerificationStatus: "verified",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        isInTrial: true,
        subscriptionStatus: "active",
        billingPlan: "free",
      },
      "awaiting_verification",
    ),
    false,
  );
  assert.equal(
    adminUserMatchesStatusFilter(
      {
        emailVerificationStatus: "verified",
        emailVerifiedAt: "2026-08-22T00:00:00.000Z",
        isInTrial: true,
        subscriptionStatus: "active",
        billingPlan: "free",
      },
      "trial",
    ),
    true,
  );
});

run("G. Auth / trial / subscription backend behavior is unchanged", () => {
  const authSrc = readFileSync(join(process.cwd(), "server/auth.ts"), "utf8");
  assert.ok(authSrc.includes("pendingVerification"));
  assert.ok(authSrc.includes('trialStatus: "none"'));
  assert.ok(authSrc.includes("emailVerifiedAt: null"));
  assert.ok(authSrc.includes("EMAIL_NOT_VERIFIED"));
  assert.equal(authSrc.includes("deriveAdminUserStatus"), false);

  const verifySrc = readFileSync(join(process.cwd(), "server/emailVerification.ts"), "utf8");
  assert.ok(verifySrc.includes("shouldStartTrial"));
  assert.equal(verifySrc.includes("deriveAdminUserStatus"), false);

  const schemaSrc = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");
  assert.match(schemaSrc, /subscriptionStatus: text\("subscription_status"\)\.default\("active"\)/);

  const routesSrc = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
  const adminUsers = routesSrc.slice(routesSrc.indexOf('app.get("/api/admin/users"'));
  assert.ok(adminUsers.includes("emailVerificationStatus"));
  assert.ok(adminUsers.includes("awaiting_verification"));
  assert.equal(adminUsers.includes("deriveAdminUserStatus"), false);
});

run("Admin Users UI uses shared derivation + awaiting filter", () => {
  const adminSrc = readFileSync(join(process.cwd(), "client/src/pages/Admin.tsx"), "utf8");
  assert.ok(adminSrc.includes("deriveAdminUserStatus"));
  assert.ok(adminSrc.includes("adminUserStatusLabel"));
  assert.ok(adminSrc.includes('value="awaiting_verification"'));
  assert.ok(adminSrc.includes("Awaiting verification"));
  assert.ok(adminSrc.includes("Subscription (billing)"));
  assert.ok(adminSrc.includes("not account activation"));
  assert.equal(adminSrc.includes('if (u.isInTrial) return "trial"'), false);
});

console.log("admin-user-status.test.ts: all assertions passed");
