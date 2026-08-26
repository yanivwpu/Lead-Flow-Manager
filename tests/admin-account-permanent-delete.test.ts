/**
 * Sales Admin permanent-delete of empty unused accounts.
 * Run: npx tsx tests/admin-account-permanent-delete.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ACCOUNT_DELETION_BLOCKER_LABELS,
  adminDeletionSessionMatchesAuthenticatedUser,
  emailsMatchForAdminDeletion,
  emptyAdminAccountDeletionSnapshot,
  evaluateAdminAccountDeletionPreflight,
  hasShopifyInstallationDeletionBlocker,
  hasStripeBillingDeletionBlocker,
  isAdminAccountDeletionUserId,
  isProtectedAdminDeletionEmail,
  normalizeAdminDeletionEmail,
  type AdminAccountDeletionBlockerCode,
  type AdminAccountDeletionSnapshot,
} from "../shared/adminAccountDeletion";

function run(name: string, fn: () => void) {
  fn();
  console.log(`✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const EMPTY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ID = "ffffffff-1111-4222-8333-444444444444";

function empty(overrides: Partial<AdminAccountDeletionSnapshot> = {}): AdminAccountDeletionSnapshot {
  return emptyAdminAccountDeletionSnapshot({
    userId: EMPTY_ID,
    name: "test",
    email: "unused-empty@example.com",
    ...overrides,
  });
}

function codesOf(snapshot: AdminAccountDeletionSnapshot | null, actor?: string) {
  return evaluateAdminAccountDeletionPreflight(snapshot, actor ? { actorCrmUserId: actor } : undefined)
    .blockers.map((b) => b.code);
}

run("empty unused account passes preflight", () => {
  const result = evaluateAdminAccountDeletionPreflight(empty());
  assert.equal(result.allowed, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.userId, EMPTY_ID);
  assert.equal(result.email, "unused-empty@example.com");
});

run("default free + subscriptionStatus active is not a Stripe blocker", () => {
  assert.equal(
    hasStripeBillingDeletionBlocker({
      billingPlan: "free",
      subscriptionStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    }),
    false,
  );
});

const BLOCKER_CASES: Array<{
  code: AdminAccountDeletionBlockerCode;
  snapshot: AdminAccountDeletionSnapshot | null;
  actor?: string;
}> = [
  { code: "not_found", snapshot: null },
  { code: "protected_account", snapshot: empty({ email: "yanivharamaty@gmail.com" }) },
  { code: "current_admin_identity", snapshot: empty(), actor: EMPTY_ID },
  { code: "stripe_billing", snapshot: empty({ stripeCustomerId: "cus_test" }) },
  { code: "shopify_installation", snapshot: empty({ shopifyShop: "demo.myshopify.com" }) },
  { code: "connected_channels", snapshot: empty({ connectedChannelCount: 1 }) },
  { code: "email_mailbox", snapshot: empty({ mailboxCount: 1 }) },
  { code: "team_memberships", snapshot: empty({ ownedTeamMemberCount: 1 }) },
  { code: "contacts_or_conversations", snapshot: empty({ contactCount: 2 }) },
  { code: "automations_or_campaigns", snapshot: empty({ workflowCount: 1 }) },
  { code: "sales_or_payouts", snapshot: empty({ conversionCount: 1 }) },
  { code: "workspace_data", snapshot: empty({ knowledgeCount: 1 }) },
];

for (const { code, snapshot, actor } of BLOCKER_CASES) {
  run(`blocker category ${code} prevents deletion`, () => {
    const result = evaluateAdminAccountDeletionPreflight(snapshot, {
      actorCrmUserId: actor,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((b) => b.code === code), codesOf(snapshot, actor).join(","));
    assert.equal(result.blockers.find((b) => b.code === code)?.label, ADMIN_ACCOUNT_DELETION_BLOCKER_LABELS[code]);
  });
}

run("Stripe trialing / past_due / paused / unpaid block even without customer id", () => {
  for (const status of ["trialing", "past_due", "paused", "unpaid", "incomplete", "incomplete_expired"]) {
    assert.equal(hasStripeBillingDeletionBlocker({ subscriptionStatus: status, billingPlan: "free" }), true, status);
  }
  assert.equal(hasStripeBillingDeletionBlocker({ billingPlan: "pro", subscriptionStatus: "active" }), true);
  assert.equal(hasStripeBillingDeletionBlocker({ stripeSubscriptionId: "sub_1" }), true);
});

run("Shopify synthetic email, install timestamp, token, charge, and status all block", () => {
  assert.equal(hasShopifyInstallationDeletionBlocker({ email: "store@shopify.whachatcrm.com" }), true);
  assert.equal(hasShopifyInstallationDeletionBlocker({ shopifyInstalledAt: new Date() }), true);
  assert.equal(hasShopifyInstallationDeletionBlocker({ shopifyAccessToken: true }), true);
  assert.equal(hasShopifyInstallationDeletionBlocker({ shopifyChargeId: true }), true);
  assert.equal(hasShopifyInstallationDeletionBlocker({ shopifySubscriptionStatus: "active" }), true);
  assert.equal(isProtectedAdminDeletionEmail("owner@shopify.whachatcrm.com"), true);
});

run("connected integrations / Meta / Twilio block as connected_channels", () => {
  assert.ok(codesOf(empty({ integrationCount: 1 })).includes("connected_channels"));
  assert.ok(codesOf(empty({ metaConnected: true })).includes("connected_channels"));
  assert.ok(codesOf(empty({ twilioConnected: true })).includes("connected_channels"));
});

run("Gmail watch, team membership as member, messages, campaigns, partner, extra workspace all block", () => {
  assert.ok(codesOf(empty({ gmailWatchCount: 1 })).includes("email_mailbox"));
  assert.ok(codesOf(empty({ memberOfTeamCount: 1 })).includes("team_memberships"));
  assert.ok(codesOf(empty({ messageCount: 1 })).includes("contacts_or_conversations"));
  assert.ok(codesOf(empty({ conversationCount: 1 })).includes("contacts_or_conversations"));
  assert.ok(codesOf(empty({ campaignEnrollmentCount: 1 })).includes("automations_or_campaigns"));
  assert.ok(codesOf(empty({ partnerId: "partner-1" })).includes("sales_or_payouts"));
  assert.ok(codesOf(empty({ extraWorkspaceRowCount: 3 })).includes("workspace_data"));
});

run("exact email confirmation is required and case-normalized", () => {
  assert.equal(normalizeAdminDeletionEmail("  Hello@Example.COM "), "hello@example.com");
  assert.equal(emailsMatchForAdminDeletion("Hello@Example.COM", "hello@example.com"), true);
  assert.equal(emailsMatchForAdminDeletion("a@x.com", "b@x.com"), false);
  assert.equal(emailsMatchForAdminDeletion("a@x.com", ""), false);
  assert.equal(emailsMatchForAdminDeletion("a@x.com", "a@x.com "), true);
});

run("wrong user ID format fails safely", () => {
  assert.equal(isAdminAccountDeletionUserId("not-a-uuid"), false);
  assert.equal(isAdminAccountDeletionUserId(EMPTY_ID), true);
  assert.equal(evaluateAdminAccountDeletionPreflight(null).blockers[0]?.code, "not_found");
});

run("current admin identity cannot be deleted; a different admin actor can preflight the same row", () => {
  const self = evaluateAdminAccountDeletionPreflight(empty(), { actorCrmUserId: EMPTY_ID });
  assert.equal(self.allowed, false);
  assert.ok(self.blockers.some((b) => b.code === "current_admin_identity"));
  const other = evaluateAdminAccountDeletionPreflight(empty(), { actorCrmUserId: OTHER_ID });
  assert.equal(other.allowed, true);
});

run("routes require Sales Admin and target only :userId", () => {
  const routes = read("server/routes.ts");
  const preflightAt = routes.indexOf('app.get("/api/admin/users/:userId/deletion-preflight"');
  const deleteAt = routes.indexOf('app.post("/api/admin/users/:userId/permanent-delete"');
  assert.ok(preflightAt > 0 && deleteAt > preflightAt);
  const preflightChunk = routes.slice(preflightAt, preflightAt + 900);
  const deleteChunk = routes.slice(deleteAt, deleteAt + 1600);
  assert.match(preflightChunk, /requireAdmin/);
  assert.match(deleteChunk, /requireAdmin/);
  assert.match(preflightChunk, /getAdminAccountDeletionPreflight\(req\.params\.userId/);
  assert.match(deleteChunk, /permanentlyDeleteEmptyAdminAccount/);
  assert.match(deleteChunk, /emailConfirmation/);
  assert.doesNotMatch(deleteChunk, /delete-by-name|deleteByEmail|bulkDelete|email domain/i);
  assert.match(routes, /Admin authentication required/);
});

run("deletion request re-runs preflight inside a locked transaction", () => {
  const service = read("server/adminAccountDeletionService.ts");
  const fnAt = service.indexOf("export async function permanentlyDeleteEmptyAdminAccount");
  const fn = service.slice(fnAt, fnAt + 4500);
  assert.match(fn, /db\.transaction/);
  assert.match(fn, /SET LOCAL TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(fn, /FOR UPDATE/);
  assert.match(fn, /evaluateAdminAccountDeletionPreflight/);
  assert.match(fn, /emailsMatchForAdminDeletion/);
  assert.match(fn, /DELETE FROM user_sessions/);
  assert.match(fn, /sess->'passport'->>'user' = \$\{userId\}/);
  assert.doesNotMatch(fn, /sess::text LIKE/);
  assert.match(fn, /tx\.delete\(users\)\.where\(eq\(users\.id, userId\)\)/);
  assert.match(fn, /activation_email_day3_sent = true/);
  assert.match(fn, /activation_email_day10_sent = true/);
  assert.match(fn, /deletion_requested_at/);
  const preflightFnAt = service.indexOf("export async function getAdminAccountDeletionPreflight");
  assert.ok(preflightFnAt > 0 && fnAt > preflightFnAt);
  assert.match(service, /loadSnapshot\(userId, tx\)/);
  assert.doesNotMatch(service, /cleanup-test-users/);
  assert.doesNotMatch(service, /cancelSubscription|uninstallShopify|stripe\.subscriptions\.cancel/);
});

run("unrelated session containing the same UUID elsewhere is not deleted", () => {
  const targetId = EMPTY_ID;
  const otherId = OTHER_ID;
  const sessions = [
    { sid: "target", sess: { cookie: { originalMaxAge: 1 }, passport: { user: targetId } } },
    {
      sid: "unrelated-substring",
      sess: {
        cookie: { originalMaxAge: 1 },
        passport: { user: otherId },
        flash: `admin viewed ${targetId}`,
        lastAdminTargetUserId: targetId,
        cookieName: `whachat.${targetId}`,
      },
    },
    { sid: "unrelated-partial", sess: { passport: { user: `${targetId}-suffix` } } },
  ];
  const remaining = sessions.filter(
    (row) => !adminDeletionSessionMatchesAuthenticatedUser(row.sess, targetId),
  );
  assert.equal(
    adminDeletionSessionMatchesAuthenticatedUser(sessions[0].sess, targetId),
    true,
  );
  assert.equal(
    adminDeletionSessionMatchesAuthenticatedUser(sessions[1].sess, targetId),
    false,
  );
  assert.deepEqual(
    remaining.map((row) => row.sid),
    ["unrelated-substring", "unrelated-partial"],
  );

  const service = read("server/adminAccountDeletionService.ts");
  assert.match(service, /sess->'passport'->>'user' = \$\{userId\}/);
  assert.doesNotMatch(service, /sess::text LIKE/);
});

run("SQL counts and deletes by exact user id, never by email domain", () => {
  const service = read("server/adminAccountDeletionService.ts");
  assert.match(service, /WHERE cs\.user_id = \$\{userId\}/);
  assert.match(service, /em\.workspace_user_id = \$\{userId\}/);
  assert.match(service, /\.where\(eq\(users\.id, userId\)\)/);
  assert.match(service, /Never deletes by name or email domain/);
  const sqlBlocks = [...service.matchAll(/sql`([\s\S]*?)`/g)].map((m) => m[1]).join("\n");
  assert.doesNotMatch(sqlBlocks, /users\.email/i);
  assert.doesNotMatch(sqlBlocks, /split\(["']@["']\)/);
  assert.doesNotMatch(sqlBlocks, /ILIKE/);
});

run("audit log is privacy-safe", () => {
  const service = read("server/adminAccountDeletionService.ts");
  const auditAt = service.indexOf("async function writeDeletionAudit");
  const audit = service.slice(auditAt, auditAt + 1200);
  assert.match(audit, /admin_account_permanent_delete/);
  assert.match(audit, /authSecurityEvents/);
  assert.match(audit, /normalizedEmail: null/);
  assert.match(audit, /actor=\$\{input\.actor\}/);
  assert.doesNotMatch(audit, /emailConfirmation|password|shopifyAccessToken|message body/);
  assert.doesNotMatch(audit, /input\.email/);
});

run("product code does not hardcode the unused test or Affordable Pompano user IDs", () => {
  const files = [
    "shared/adminAccountDeletion.ts",
    "server/adminAccountDeletionService.ts",
    "client/src/components/admin/AdminUserPermanentDelete.tsx",
    "client/src/pages/Admin.tsx",
  ];
  for (const file of files) {
    const src = read(file);
    assert.equal(src.includes("38767007-f53f-4ee9-9dc6-babb3676bdf1"), false, file);
    assert.equal(src.includes("9c1e65d2-2132-4436-8884-925356161cf9"), false, file);
    assert.equal(src.includes("hello@affordablepompano.com"), false, file);
  }
});

run("successful deletion flags prevent later activation and trial emails", () => {
  const service = read("server/adminAccountDeletionService.ts");
  const updateAt = service.indexOf("activation_email_day3_sent = true");
  const deleteAt = service.indexOf("await tx.delete(users)");
  assert.ok(updateAt > 0 && deleteAt > updateAt, "mail flags must be set before DELETE");
  const activation = read("server/activationEmailService.ts");
  assert.match(activation, /if \(user\.deletionRequestedAt\) continue/);
  const trial = read("shared/trialExpirationEmailEligibility.ts");
  assert.match(trial, /deletion_requested/);
});

run("self-service deletion flow is unchanged and cleanup script is not used", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /app\.post\("\/api\/account\/delete-request"/);
  assert.match(routes, /app\.delete\("\/api\/account"/);
  const service = read("server/adminAccountDeletionService.ts");
  assert.doesNotMatch(service, /requestAccountDeletion/);
  assert.doesNotMatch(service, /cleanup-test-users/);
});

run("UI loads preflight, shows blockers without bypass, and requires typed email", () => {
  const ui = read("client/src/components/admin/AdminUserPermanentDelete.tsx");
  const admin = read("client/src/pages/Admin.tsx");
  assert.match(admin, /AdminUserPermanentDeleteButton/);
  assert.match(admin, /variant="labeled"/);
  assert.match(admin, /Danger zone/);
  assert.match(ui, /Delete account/);
  assert.match(admin, /sticky right-0/);
  assert.match(admin, /table-fixed/);
  assert.doesNotMatch(admin, /min-w-\[260px\]/);
  assert.doesNotMatch(admin, /min-w-\[180px\]/);
  assert.match(ui, /\/api\/admin\/users\/\$\{user\.id\}\/deletion-preflight/);
  assert.match(ui, /\/api\/admin\/users\/\$\{user\.id\}\/permanent-delete/);
  assert.match(ui, /emailConfirmation/);
  assert.match(ui, /emailsMatchForAdminDeletion/);
  assert.match(ui, /This permanently deletes the account/);
  assert.match(ui, /preflight\?\.blockers/);
  assert.match(ui, /variant = "icon"/);
  assert.doesNotMatch(ui, /bypass|forceDelete|ignore blockers/i);
  assert.match(ui, /disabled=\{deleting \|\| !emailMatches\}/);
  assert.match(ui, /deletingRef/);
  assert.match(ui, /e\.stopPropagation\(\)/);
  assert.doesNotMatch(ui, /bulk|selectedUserIds|deleteAll/i);
  assert.match(admin, /invalidateQueries\(\{ queryKey: \["\/api\/admin\/users"\] \}\)/);
});

run("unauthorized non-admin path still uses requireAdmin 401", () => {
  const routes = read("server/routes.ts");
  const mw = routes.slice(
    routes.indexOf("const requireAdmin"),
    routes.indexOf("const requireAdmin") + 700,
  );
  assert.match(mw, /isAdminAuthorized/);
  assert.match(mw, /status\(401\)\.json\(\{ error: "Admin authentication required" \}\)/);
});

console.log("admin-account-permanent-delete.test.ts: all assertions passed");
