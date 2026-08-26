/**
 * Retirement of the built-in CRM Demo Agent.
 * Run: npx tsx tests/retired-crm-demo-agent.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRetiredCrmDemoEmail, RETIRED_CRM_DEMO_EMAIL } from "../shared/retiredCrmDemoAgent";
import { isExcludedActivationAccount } from "../shared/adminActivationMetrics";
import { isProtectedAdminDeletionEmail, evaluateAdminAccountDeletionPreflight, emptyAdminAccountDeletionSnapshot } from "../shared/adminAccountDeletion";
import {
  RETIRED_CRM_DEMO_CLEANUP_EXECUTE_ENV,
  RETIRED_CRM_DEMO_USER_ID,
  evaluateRetiredCrmDemoCleanupPreflight,
  executeCleanupConfirmed,
  parseRetiredCrmDemoCleanupCli,
  qualifyingRetiredCrmDemoFixtureSnapshot,
} from "../shared/retiredCrmDemoAgentCleanup";

function run(name: string, fn: () => void) {
  fn();
  console.log(`✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const OTHER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

run("retired identity helper matches only the CRM Demo Agent email", () => {
  assert.equal(isRetiredCrmDemoEmail("demo@whachat.com"), true);
  assert.equal(isRetiredCrmDemoEmail("  Demo@Whachat.com "), true);
  assert.equal(isRetiredCrmDemoEmail("demo@sales.com"), false);
  assert.equal(isRetiredCrmDemoEmail("partner@demo.com"), false);
  assert.equal(isRetiredCrmDemoEmail("user@example.com"), false);
});

run("public Auth screen no longer displays demo credentials and offers book-a-demo", () => {
  const auth = read("client/src/pages/Auth.tsx");
  assert.equal(auth.includes("demo@whachat.com"), false);
  assert.equal(auth.includes("password123"), false);
  assert.match(auth, /BookDemoModal/);
  assert.match(auth, /Book a demo/);
  assert.match(auth, /navigateAfterAuth/);
});

run("login no longer accepts or recreates the Demo Agent", () => {
  const auth = read("server/auth.ts");
  assert.equal(auth.includes("DEMO_EMAIL"), false);
  assert.equal(auth.includes("DEMO_PASSWORD"), false);
  assert.equal(auth.includes("demo_bypass"), false);
  assert.equal(auth.includes("setupDemoSampleData"), false);
  assert.equal(auth.includes("password123"), false);
  assert.match(auth, /isRetiredCrmDemoEmail/);
  assert.match(auth, /failureReason: 'retired_crm_demo'/);
  assert.match(auth, /Invalid email or password/);
  assert.match(auth, /path: 'local_strategy'/);
  assert.match(auth, /storage\.createUser/);
  const loginAt = auth.indexOf("passport.use(");
  const signupAt = auth.indexOf("app.post('/api/auth/signup'");
  const loginChunk = auth.slice(loginAt, signupAt);
  assert.equal(loginChunk.includes("createUser"), false);
  assert.equal(loginChunk.includes("setupDemoSampleData"), false);
});

run("signup and password reset cannot recreate the retired identity", () => {
  const auth = read("server/auth.ts");
  assert.match(auth, /signup_rejected_retired_identity/);
  assert.match(auth, /This email cannot be used to create an account/);
  const forgotAt = auth.indexOf("app.post('/api/auth/forgot-password'");
  const forgotChunk = auth.slice(forgotAt, forgotAt + 1800);
  assert.match(forgotChunk, /isRetiredCrmDemoEmail/);
  assert.match(forgotChunk, /retired_crm_demo/);
  const debugAt = auth.indexOf("app.post('/api/auth/reset-debug'");
  const debugChunk = auth.slice(debugAt, debugAt + 1200);
  assert.match(debugChunk, /isRetiredCrmDemoEmail/);
});

run("ordinary login path remains bcrypt local strategy", () => {
  const auth = read("server/auth.ts");
  assert.match(auth, /verifyLoginPassword/);
  assert.match(auth, /resolveUserForLogin/);
  assert.match(auth, /new LocalStrategy/);
  const storage = read("server/storage.ts");
  assert.equal(storage.includes("isDemoUser"), false);
  assert.equal(storage.includes("demo@whachat.com"), false);
});

run("AI Brain no longer grants access by Demo Agent email", () => {
  const sub = read("server/subscriptionService.ts");
  assert.equal(sub.includes("demo@whachat.com"), false);
  assert.equal(sub.includes('source: "demo"'), false);
  assert.doesNotMatch(sub, /"demo" \|/);
  assert.match(sub, /isManualAIBrainEmail/);
  assert.match(sub, /isProAiTrialActive/);
  assert.match(sub, /stripeCustomerHasActiveAIBrainAddon/);
});

run("RGE no longer has Demo Agent email bypasses", () => {
  const templates = read("server/templateRoutes.ts");
  assert.equal(templates.includes("demo@whachat.com"), false);
  assert.equal(templates.includes('success: true, demo: true'), false);
  assert.equal(templates.includes('"demo"'), false);
  assert.match(templates, /evaluateGrowthEngineAccess/);
  assert.match(templates, /isUserWhatsAppConnectedForActivation/);
});

run("FollowUps no longer uses demo-specific chats routing", () => {
  const followUps = read("client/src/pages/FollowUps.tsx");
  assert.equal(followUps.includes("demo@whachat.com"), false);
  assert.equal(followUps.includes("isDemoUser"), false);
  assert.equal(followUps.includes("patchChat"), false);
  assert.match(followUps, /queryKey: \['\/api\/inbox'\]/);
  assert.match(followUps, /enabled: !!user/);
});

run("Sales Portal demo identity is unchanged", () => {
  const portal = read("client/src/pages/SalesPortal.tsx");
  assert.match(portal, /demo@sales\.com \/ 123456/);
  const routes = read("server/routes.ts");
  assert.match(routes, /const DEMO_SALES_EMAIL = 'demo@sales\.com'/);
  assert.match(routes, /const DEMO_SALES_CODE = '123456'/);
  assert.equal(isRetiredCrmDemoEmail("demo@sales.com"), false);
  assert.equal(isProtectedAdminDeletionEmail("demo@sales.com"), true);
  assert.equal(isProtectedAdminDeletionEmail("yanivharamaty@gmail.com"), true);
  assert.equal(isProtectedAdminDeletionEmail("yahabegood@gmail.com"), true);
});

run("cleanup CLI defaults to dry-run and requires exact UUID plus email", () => {
  const parsed = parseRetiredCrmDemoCleanupCli([]);
  assert.equal(parsed.execute, false);
  assert.ok(parsed.errors.length > 0);

  const dry = parseRetiredCrmDemoCleanupCli([
    `--user-id=${RETIRED_CRM_DEMO_USER_ID}`,
    `--email=${RETIRED_CRM_DEMO_EMAIL}`,
  ]);
  assert.equal(dry.execute, false);
  assert.deepEqual(dry.errors, []);
  assert.equal(dry.userId, RETIRED_CRM_DEMO_USER_ID);
  assert.equal(dry.email, RETIRED_CRM_DEMO_EMAIL);

  const exec = parseRetiredCrmDemoCleanupCli([
    `--user-id=${RETIRED_CRM_DEMO_USER_ID}`,
    `--email=${RETIRED_CRM_DEMO_EMAIL}`,
    "--execute",
  ]);
  assert.equal(exec.execute, true);
  assert.deepEqual(exec.errors, []);

  const wrongId = parseRetiredCrmDemoCleanupCli([
    `--user-id=${OTHER_ID}`,
    `--email=${RETIRED_CRM_DEMO_EMAIL}`,
  ]);
  assert.ok(wrongId.errors.some((e) => e.includes("user-id")));

  const wrongEmail = parseRetiredCrmDemoCleanupCli([
    `--user-id=${RETIRED_CRM_DEMO_USER_ID}`,
    "--email=demo@sales.com",
  ]);
  assert.ok(wrongEmail.errors.some((e) => e.includes("email")));

  const emailOnly = parseRetiredCrmDemoCleanupCli([`--email=${RETIRED_CRM_DEMO_EMAIL}`]);
  assert.ok(emailOnly.errors.length > 0);
  assert.equal(executeCleanupConfirmed({}), false);
  assert.equal(executeCleanupConfirmed({ [RETIRED_CRM_DEMO_CLEANUP_EXECUTE_ENV]: "1" }), true);
});

run("cleanup refuses wrong UUID/email or unexpected data", () => {
  const fixture = qualifyingRetiredCrmDemoFixtureSnapshot();
  const ok = evaluateRetiredCrmDemoCleanupPreflight(fixture, {
    emailConfirmation: RETIRED_CRM_DEMO_EMAIL,
  });
  assert.equal(ok.allowed, true, ok.blockers.map((b) => b.code).join(","));
  assert.deepEqual(ok.counts, {
    contacts: 7,
    conversations: 8,
    messages: 33,
    chats: 3,
    messagesWithExternalId: 0,
  });

  const wrongId = evaluateRetiredCrmDemoCleanupPreflight(
    qualifyingRetiredCrmDemoFixtureSnapshot({ userId: OTHER_ID }),
    { emailConfirmation: RETIRED_CRM_DEMO_EMAIL },
  );
  assert.equal(wrongId.allowed, false);
  assert.ok(wrongId.blockers.some((b) => b.code === "cli_identity_mismatch" || b.code === "fixture_mismatch"));

  const wrongEmail = evaluateRetiredCrmDemoCleanupPreflight(fixture, {
    emailConfirmation: "demo@sales.com",
  });
  assert.equal(wrongEmail.allowed, false);

  const extraContact = evaluateRetiredCrmDemoCleanupPreflight(
    qualifyingRetiredCrmDemoFixtureSnapshot({
      contactCount: 8,
      contactNames: [...fixture.contactNames, "Real Customer"],
    }),
    { emailConfirmation: RETIRED_CRM_DEMO_EMAIL },
  );
  assert.equal(extraContact.allowed, false);
  assert.ok(extraContact.blockers.some((b) => b.code === "fixture_mismatch"));

  const providerMessages = evaluateRetiredCrmDemoCleanupPreflight(
    qualifyingRetiredCrmDemoFixtureSnapshot({ messagesWithExternalId: 1 }),
    { emailConfirmation: RETIRED_CRM_DEMO_EMAIL },
  );
  assert.equal(providerMessages.allowed, false);

  const stripe = evaluateRetiredCrmDemoCleanupPreflight(
    qualifyingRetiredCrmDemoFixtureSnapshot({ stripeCustomerId: "cus_x" }),
    { emailConfirmation: RETIRED_CRM_DEMO_EMAIL },
  );
  assert.equal(stripe.allowed, false);
  assert.ok(stripe.blockers.some((b) => b.code === "stripe_present"));

  const workspace = evaluateRetiredCrmDemoCleanupPreflight(
    qualifyingRetiredCrmDemoFixtureSnapshot({ workflowCount: 1 }),
    { emailConfirmation: RETIRED_CRM_DEMO_EMAIL },
  );
  assert.equal(workspace.allowed, false);
  assert.ok(workspace.blockers.some((b) => b.code === "unexpected_workspace"));
});

run("exact fixture-only account qualifies for guarded cleanup after retirement", () => {
  const preflight = evaluateRetiredCrmDemoCleanupPreflight(qualifyingRetiredCrmDemoFixtureSnapshot(), {
    emailConfirmation: RETIRED_CRM_DEMO_EMAIL,
  });
  assert.equal(preflight.allowed, true);
  assert.equal(isProtectedAdminDeletionEmail(RETIRED_CRM_DEMO_EMAIL), true);
  const admin = evaluateAdminAccountDeletionPreflight(
    emptyAdminAccountDeletionSnapshot({
      userId: RETIRED_CRM_DEMO_USER_ID,
      email: RETIRED_CRM_DEMO_EMAIL,
      name: "Demo Agent",
      billingPlan: "pro",
      contactCount: 7,
      conversationCount: 8,
      messageCount: 33,
      chatCount: 3,
    }),
  );
  assert.equal(admin.allowed, false);
  assert.ok(admin.blockers.some((b) => b.code === "protected_account"));
  assert.ok(admin.blockers.some((b) => b.code === "contacts_or_conversations"));
});

run("cleanup script is dry-run by default and never selects by email alone", () => {
  const script = read("scripts/retire-crm-demo-agent.ts");
  assert.match(script, /mode: parsed\.execute \? "execute" : "dry-run"/);
  assert.match(script, /Dry-run complete\. No rows deleted/);
  assert.match(script, /RETIRED_CRM_DEMO_CLEANUP_EXECUTE/);
  assert.match(script, /eq\(users\.id, userId\)/);
  assert.doesNotMatch(script, /WHERE lower\(email\)/);
  assert.doesNotMatch(script, /getUserByEmail/);
  assert.match(script, /retired_crm_demo_agent_cleanup/);
  assert.match(script, /normalizedEmail: null/);
  assert.doesNotMatch(script, /DEMO_PASSWORD|password123|STRIPE_SECRET_KEY/);
  assert.match(script, /sess->'passport'->>'user' = \$\{parsed\.userId\}/);
});

run("activation leftover exclusion remains until guarded cleanup; owner protections unchanged", () => {
  assert.equal(isExcludedActivationAccount(RETIRED_CRM_DEMO_EMAIL), true);
  assert.equal(isExcludedActivationAccount("customer@example.com"), false);
  assert.equal(isProtectedAdminDeletionEmail("owner@shopify.whachatcrm.com"), true);
  const activation = read("server/adminActivationService.ts");
  assert.match(activation, /RETIRED_CRM_DEMO_EMAIL/);
});

run("Chats in-app sample mode and partner portal demo are not this identity", () => {
  const chats = read("client/src/pages/Chats.tsx");
  assert.equal(chats.includes("demo@whachat.com"), false);
  const partner = read("client/src/pages/PartnerPortal.tsx");
  assert.match(partner, /partner@demo.com \/ password123/);
  assert.equal(partner.includes("demo@whachat.com"), false);
});

console.log("retired-crm-demo-agent.test.ts: all assertions passed");
