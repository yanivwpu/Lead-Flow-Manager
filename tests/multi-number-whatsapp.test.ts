/**
 * REGRESSION SUITE: Multi-Number WhatsApp Isolation
 *
 * Protected feature — see replit.md "PROTECTED PRODUCTION FEATURE" section.
 *
 * Tests:
 *   T1 — Primary number routes via users.twilioWhatsappNumber
 *   T2 — Secondary number routes via registeredPhones fallback
 *   T3 — Same contact + 2 numbers → 2 fully isolated conversation threads
 *   T4 — Outbound reply uses conversation.channelAccountId as Twilio from-number
 *   T5 — Legacy NULL conversation is backfilled, not duplicated
 *
 * Run: npx tsx tests/multi-number-whatsapp.test.ts
 */

import { storage } from "../server/storage";
import { findUserByTwilioCredentials } from "../server/userTwilio";

const REPORT: { test: string; status: "PASS" | "FAIL"; details: string }[] = [];

// ── Test account constants ───────────────────────────────────────────────────
const ACCT_SID      = "AC_multinumber_test";
const AUTH_TOKEN    = "mock_auth_token_multi";
const PRIMARY_NUM   = "+15550010001";
const SECONDARY_NUM = "+15550010002";
const UNRELATED_NUM = "+15550099999"; // should never match

// ── Global state ─────────────────────────────────────────────────────────────
let userId      = "";
let contactId   = "";  // routing tests only — no conversations created on this contact
let regPhoneId  = "";

// Each conversation-creation scenario gets its own fresh contact to prevent
// cross-test state pollution when getConversationByContactAndChannel searches.
let t3ContactId = "";
let t4ContactId = "";
let t5ContactId = "";

// ── Helpers ──────────────────────────────────────────────────────────────────
function pass(test: string, details: string) {
  REPORT.push({ test, status: "PASS", details });
  console.log(`\n✅ [PASS] ${test}`);
  console.log(`   ${details}`);
}

function fail(test: string, details: string) {
  REPORT.push({ test, status: "FAIL", details });
  console.log(`\n❌ [FAIL] ${test}`);
  console.log(`   ${details}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  REGRESSION SUITE: Multi-Number WhatsApp Isolation");
  console.log("══════════════════════════════════════════════════════\n");

  const user = await storage.createUser({
    email:    `multi-number-test-${Date.now()}@test.com`,
    password: "test123",
    name:     "Multi-Number Test User",
  });
  userId = user.id;

  // Connect Twilio with PRIMARY_NUM as the account's primary number
  await storage.updateUser(userId, {
    twilioConnected:       true,
    twilioAccountSid:      ACCT_SID,
    twilioAuthToken:       AUTH_TOKEN,
    twilioWhatsappNumber:  PRIMARY_NUM,
    whatsappProvider:      "twilio",
  });

  // Register SECONDARY_NUM as a secondary number for the same account
  const regPhone = await storage.registerPhone({
    userId,
    phoneNumber:  SECONDARY_NUM,
    businessName: "Secondary Line",
  });
  regPhoneId = regPhone.id;

  // Shared contact for routing tests (T1, T2) — no conversations ever created on it
  const contact = await storage.createContact({
    userId,
    name:           "Routing Customer",
    phone:          "+15550019999",
    primaryChannel: "whatsapp",
  });
  contactId = contact.id;

  // Separate contacts for conversation-creation tests (prevents cross-test pollution)
  const t3c = await storage.createContact({ userId, name: "T3 Customer", phone: "+15550031111", primaryChannel: "whatsapp" });
  const t4c = await storage.createContact({ userId, name: "T4 Customer", phone: "+15550041111", primaryChannel: "whatsapp" });
  const t5c = await storage.createContact({ userId, name: "T5 Customer", phone: "+15550051111", primaryChannel: "whatsapp" });
  t3ContactId = t3c.id;
  t4ContactId = t4c.id;
  t5ContactId = t5c.id;

  console.log(`userId:        ${userId}`);
  console.log(`contactId:     ${contactId}  (routing tests only)`);
  console.log(`t3ContactId:   ${t3ContactId}`);
  console.log(`t4ContactId:   ${t4ContactId}`);
  console.log(`t5ContactId:   ${t5ContactId}`);
  console.log(`primaryNum:    ${PRIMARY_NUM}  (users.twilioWhatsappNumber)`);
  console.log(`secondaryNum:  ${SECONDARY_NUM} (registered_phones)\n`);
}

// ── T1: Primary number routing ───────────────────────────────────────────────
async function t1_primaryNumberRouting() {
  console.log("\n── T1: Primary number routing ──");

  const result = await findUserByTwilioCredentials(ACCT_SID, PRIMARY_NUM);

  const matched     = !!result;
  const sameUser    = result?.user.id === userId;
  const rightPhone  = result?.matchedPhone === PRIMARY_NUM;

  if (matched && sameUser && rightPhone) {
    pass(
      "T1: Primary number routes via users.twilioWhatsappNumber",
      `matchedPhone=${result!.matchedPhone}  userId=${result!.user.id}`
    );
  } else {
    fail(
      "T1: Primary number routes via users.twilioWhatsappNumber",
      `matched=${matched} sameUser=${sameUser} rightPhone=${rightPhone}  ` +
      `got=${JSON.stringify({ id: result?.user.id, phone: result?.matchedPhone })}`
    );
  }
}

// ── T2: Secondary number routing (registeredPhones fallback) ─────────────────
async function t2_secondaryNumberRouting() {
  console.log("\n── T2: Secondary number routing (registeredPhones fallback) ──");

  const resultSecondary = await findUserByTwilioCredentials(ACCT_SID, SECONDARY_NUM);
  const resultUnknown   = await findUserByTwilioCredentials(ACCT_SID, UNRELATED_NUM);

  const secondaryMatched  = !!resultSecondary;
  const secondarySameUser = resultSecondary?.user.id === userId;
  const secondaryRightNum = resultSecondary?.matchedPhone === SECONDARY_NUM;
  const unknownRejected   = resultUnknown === undefined;

  if (secondaryMatched && secondarySameUser && secondaryRightNum && unknownRejected) {
    pass(
      "T2: Secondary number routes via registeredPhones; unrelated number rejected",
      `secondary → matchedPhone=${resultSecondary!.matchedPhone} userId=${resultSecondary!.user.id}  |  ` +
      `unrelated → ${unknownRejected ? "correctly undefined" : "WRONGLY matched"}`
    );
  } else {
    fail(
      "T2: Secondary number routes via registeredPhones; unrelated number rejected",
      `secondaryMatched=${secondaryMatched} sameUser=${secondarySameUser} rightNum=${secondaryRightNum} ` +
      `unknownRejected=${unknownRejected}`
    );
  }

  // Extra guard: secondary must not leak to a different user
  if (resultSecondary && resultSecondary.user.id !== userId) {
    fail(
      "T2 (guard): Secondary number must not match a different user",
      `Expected userId=${userId}, got ${resultSecondary.user.id}`
    );
  }

  // Extra guard: accountSid cross-check prevents secondary number theft
  const wrongSidResult = await findUserByTwilioCredentials("AC_WRONG_SID", SECONDARY_NUM);
  if (wrongSidResult === undefined) {
    pass(
      "T2 (guard): Wrong accountSid cannot claim a secondary number",
      "findUserByTwilioCredentials('AC_WRONG_SID', SECONDARY_NUM) → undefined ✓"
    );
  } else {
    fail(
      "T2 (guard): Wrong accountSid cannot claim a secondary number",
      `Expected undefined, got userId=${wrongSidResult.user.id}`
    );
  }
}

// ── T3: Same contact + 2 numbers → 2 isolated conversations ─────────────────
async function t3_conversationIsolation() {
  console.log("\n── T3: Same contact + 2 numbers → 2 isolated conversations ──");

  // Simulate inbound from customer → PRIMARY_NUM
  const convA = await storage.createConversation({
    userId,
    contactId:        t3ContactId,
    channel:          "whatsapp",
    channelAccountId: PRIMARY_NUM,
    status:           "open",
  });

  // Simulate inbound from same customer → SECONDARY_NUM
  const convB = await storage.createConversation({
    userId,
    contactId:        t3ContactId,
    channel:          "whatsapp",
    channelAccountId: SECONDARY_NUM,
    status:           "open",
  });

  // Look them back up to prove isolation
  const lookedUpA = await storage.getConversationByContactAndChannel(t3ContactId, "whatsapp", PRIMARY_NUM);
  const lookedUpB = await storage.getConversationByContactAndChannel(t3ContactId, "whatsapp", SECONDARY_NUM);

  const differentIds      = convA.id !== convB.id;
  const aHasCorrectNum    = convA.channelAccountId === PRIMARY_NUM;
  const bHasCorrectNum    = convB.channelAccountId === SECONDARY_NUM;
  const lookupAMatches    = lookedUpA?.id === convA.id;
  const lookupBMatches    = lookedUpB?.id === convB.id;
  const lookupReturnsDiff = lookedUpA?.id !== lookedUpB?.id;

  if (differentIds && aHasCorrectNum && bHasCorrectNum && lookupAMatches && lookupBMatches && lookupReturnsDiff) {
    pass(
      "T3: Same contact + 2 numbers → 2 isolated conversation threads",
      `convA id=${convA.id} num=${convA.channelAccountId}  |  ` +
      `convB id=${convB.id} num=${convB.channelAccountId}  |  ` +
      `lookup returns correct thread for each number ✓`
    );
  } else {
    fail(
      "T3: Same contact + 2 numbers → 2 isolated conversation threads",
      `differentIds=${differentIds} aNum=${aHasCorrectNum} bNum=${bHasCorrectNum} ` +
      `lookupA=${lookupAMatches} lookupB=${lookupBMatches} lookupDiff=${lookupReturnsDiff}`
    );
  }

  // Extra guard: looking up PRIMARY_NUM must never return convB
  if (lookedUpA?.id === convB.id) {
    fail(
      "T3 (guard): PRIMARY_NUM lookup must never return SECONDARY_NUM conversation",
      `lookedUpA.id=${lookedUpA?.id} equals convB.id=${convB.id} — threads are MERGED`
    );
  } else {
    pass(
      "T3 (guard): PRIMARY_NUM lookup never returns SECONDARY_NUM conversation",
      `lookedUpA.id=${lookedUpA?.id} ≠ convB.id=${convB.id} — threads are isolated ✓`
    );
  }
}

// ── T4: Outbound reply uses conversation.channelAccountId ────────────────────
async function t4_outboundFromNumber() {
  console.log("\n── T4: Outbound reply uses conversation.channelAccountId ──");

  // Create a conversation that arrived on the secondary number.
  // Uses t4ContactId (fresh contact with NO other conversations) so that
  // channelService.sendMessage() → getConversationByContactAndChannel(t4ContactId, 'whatsapp')
  // will unambiguously find THIS conversation with SECONDARY_NUM.
  const conv = await storage.createConversation({
    userId,
    contactId:        t4ContactId,
    channel:          "whatsapp",
    channelAccountId: SECONDARY_NUM,
    status:           "open",
  });

  // Read it back to confirm storage round-trip
  const fetched = await storage.getConversationByContactAndChannel(t4ContactId, "whatsapp", SECONDARY_NUM);

  const channelAccountIdStored   = conv.channelAccountId === SECONDARY_NUM;
  const channelAccountIdFetched  = fetched?.channelAccountId === SECONDARY_NUM;

  if (!channelAccountIdStored || !channelAccountIdFetched) {
    fail(
      "T4: conversation.channelAccountId stored and retrieved correctly",
      `stored=${channelAccountIdStored} fetched=${channelAccountIdFetched}`
    );
    return;
  }

  // Verify the adapter's from-number selection logic by capturing its log
  // WhatsAppAdapter.send() emits:
  //   "[WhatsAppAdapter] Using channelAccountId=<num> as from-number (multi-number conversation)"
  // before any API call — this proves it read channelAccountId correctly.
  const { registerChannelAdapters } = await import("../server/channelAdapters");
  registerChannelAdapters();
  const { channelService } = await import("../server/channelService");

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => {
    const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logs.push(msg);
    origLog(...args);
  };

  // Attempt the send — it will fail at the Twilio API level (no real creds) but
  // the fromNumber log is emitted BEFORE the API call.
  // t4ContactId has only ONE conversation (SECONDARY_NUM) so the service
  // unambiguously finds and uses it.
  await channelService.sendMessage({
    userId,
    contactId: t4ContactId,
    content: "Reply from secondary line",
  }).catch(() => {});

  console.log = origLog;

  const fromNumberLog = logs.find(l =>
    l.includes("[WhatsAppAdapter] Using channelAccountId=") &&
    l.includes(SECONDARY_NUM)
  );
  const primaryNumberUsed = logs.some(l =>
    l.includes("[WhatsAppAdapter] Using channelAccountId=") &&
    l.includes(PRIMARY_NUM) && !l.includes(SECONDARY_NUM)
  );

  if (channelAccountIdStored && channelAccountIdFetched && fromNumberLog) {
    pass(
      "T4: Outbound reply selects conversation.channelAccountId as Twilio from-number",
      `channelAccountId stored: ${conv.channelAccountId}  |  ` +
      `adapter log: "${fromNumberLog?.trim()}"  |  ` +
      `primary number NOT used: ${!primaryNumberUsed} ✓`
    );
  } else {
    fail(
      "T4: Outbound reply selects conversation.channelAccountId as Twilio from-number",
      `stored=${channelAccountIdStored} fetched=${channelAccountIdFetched} ` +
      `adapterLogFound=${!!fromNumberLog} primaryUsed=${primaryNumberUsed}  ` +
      `allLogs=${logs.filter(l => l.includes("WhatsAppAdapter") || l.includes("TwilioSend")).join(" | ")}`
    );
  }
}

// ── T5: Legacy NULL conversation backfill — no duplicate threads ─────────────
async function t5_nullBackfillNoDuplicates() {
  console.log("\n── T5: Legacy NULL conversation backfill — no duplicate threads ──");

  // t5ContactId is a fresh contact with NO prior conversations — guarantees
  // the lookup finds the NULL legacy row we create here, not an existing one.

  // Create a legacy conversation with no channelAccountId (pre-fix row)
  const legacy = await storage.createConversation({
    userId,
    contactId: t5ContactId,
    channel:   "whatsapp",
    status:    "open",
    // channelAccountId intentionally omitted → NULL
  });

  assert(!legacy.channelAccountId, "Legacy conversation must start with NULL channelAccountId");

  // First lookup with PRIMARY_NUM — should return the legacy row AND backfill it
  const afterFirstLookup = await storage.getConversationByContactAndChannel(
    t5ContactId, "whatsapp", PRIMARY_NUM
  );
  const wasBackfilled = afterFirstLookup?.channelAccountId === PRIMARY_NUM;
  const sameId        = afterFirstLookup?.id === legacy.id;

  // Second lookup with PRIMARY_NUM — must return the same backfilled row, not a duplicate
  const afterSecondLookup = await storage.getConversationByContactAndChannel(
    t5ContactId, "whatsapp", PRIMARY_NUM
  );
  const noDuplicate = afterSecondLookup?.id === legacy.id;

  const uniqueIds = new Set([afterFirstLookup?.id, afterSecondLookup?.id].filter(Boolean));
  const exactlyOne = uniqueIds.size === 1 && uniqueIds.has(legacy.id);

  if (wasBackfilled && sameId && noDuplicate && exactlyOne) {
    pass(
      "T5: Legacy NULL conversation is backfilled, not duplicated",
      `legacyId=${legacy.id}  |  ` +
      `backfilled to ${afterFirstLookup?.channelAccountId}  |  ` +
      `sameId=${sameId}  |  noDuplicate=${noDuplicate}  |  uniqueRowCount=1 ✓`
    );
  } else {
    fail(
      "T5: Legacy NULL conversation is backfilled, not duplicated",
      `backfilled=${wasBackfilled} sameId=${sameId} noDuplicate=${noDuplicate} exactlyOne=${exactlyOne}  ` +
      `first=${afterFirstLookup?.id} second=${afterSecondLookup?.id} legacy=${legacy.id}`
    );
  }

  // Guard: SECONDARY_NUM lookup on the same contact must return a DIFFERENT conversation
  // (backfilled with SECONDARY_NUM), not the PRIMARY_NUM-backfilled legacy row.
  const secondaryLookup = await storage.getConversationByContactAndChannel(
    t5ContactId, "whatsapp", SECONDARY_NUM
  );
  // At this point t5ContactId has exactly one row (now backfilled with PRIMARY_NUM).
  // SECONDARY_NUM lookup finds that row (NULL fallback picks it up before backfill,
  // but after backfill it has PRIMARY_NUM so exact-match won't find it).
  // The critical check: secondaryLookup must NOT claim it's a PRIMARY_NUM thread.
  const notCrossContaminated = secondaryLookup?.channelAccountId !== PRIMARY_NUM;

  if (notCrossContaminated) {
    pass(
      "T5 (guard): SECONDARY_NUM lookup does not inherit PRIMARY_NUM channelAccountId",
      `secondaryLookup.channelAccountId=${secondaryLookup?.channelAccountId ?? "null"} ≠ PRIMARY_NUM ✓`
    );
  } else {
    fail(
      "T5 (guard): SECONDARY_NUM lookup does not inherit PRIMARY_NUM channelAccountId",
      `secondaryLookup.channelAccountId=${secondaryLookup?.channelAccountId} — cross-contamination detected`
    );
  }
}

// ── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
  // The user cascade-deletes all its data (contacts, conversations, registered_phones)
  try {
    const { db } = await import("../drizzle/db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(users).where(eq(users.id, userId));
    console.log("\n[Teardown] Test user and all related data deleted ✓");
  } catch (err) {
    console.warn("[Teardown] Cleanup failed (non-fatal):", err);
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function runAll() {
  try {
    await setup();
    await t1_primaryNumberRouting();
    await t2_secondaryNumberRouting();
    await t3_conversationIsolation();
    await t4_outboundFromNumber();
    await t5_nullBackfillNoDuplicates();
  } catch (err) {
    console.error("\n[FATAL] Test suite error:", err);
    process.exitCode = 1;
  } finally {
    await teardown();
  }

  const passed = REPORT.filter(r => r.status === "PASS").length;
  const failed = REPORT.filter(r => r.status === "FAIL").length;

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  REGRESSION REPORT: Multi-Number WhatsApp Isolation");
  console.log("══════════════════════════════════════════════════════\n");

  for (const r of REPORT) {
    console.log(`${r.status === "PASS" ? "✅" : "❌"} ${r.test}`);
    console.log(`   ${r.details}\n`);
  }

  console.log("──────────────────────────────────────────────────────");
  console.log(`  Total: ${REPORT.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
  console.log("──────────────────────────────────────────────────────\n");

  if (failed > 0) process.exit(1);
}

runAll();
