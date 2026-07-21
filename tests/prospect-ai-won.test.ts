/**
 * Prospect AI Won / outcome tracking — pure helper tests (no DB).
 * Run: npx tsx tests/prospect-ai-won.test.ts
 */
import assert from "node:assert/strict";
import {
  buildProspectAiWonStats,
  computeProspectAiOutreachFlags,
  formatProspectAiRate,
  isProspectAiAttributedContact,
  isProspectAiOutcome,
  prospectAiRate,
  resolveProspectAiWonTimeRangeStart,
  PROSPECT_AI_IMPORT_PROVIDER,
  PROSPECT_AI_OUTCOMES,
} from "../shared/prospectAI";

function testOutcomesEnum() {
  assert.ok(PROSPECT_AI_OUTCOMES.includes("won"));
  assert.ok(PROSPECT_AI_OUTCOMES.includes("lost"));
  assert.ok(PROSPECT_AI_OUTCOMES.includes("active"));
  assert.equal(isProspectAiOutcome("won"), true);
  assert.equal(isProspectAiOutcome("nope"), false);
  assert.equal(isProspectAiOutcome(null), false);
}

function testRates() {
  assert.equal(prospectAiRate(1, 0), null);
  assert.equal(prospectAiRate(0, 0), null);
  assert.equal(prospectAiRate(5, 10), 0.5);
  assert.equal(prospectAiRate(1, -1), null);
  assert.equal(formatProspectAiRate(null), "—");
  assert.equal(formatProspectAiRate(0.5), "50%");
  assert.equal(formatProspectAiRate(0.123), "12.3%");

  const stats = buildProspectAiWonStats({
    outreachSent: 10,
    replied: 4,
    qualified: 2,
    won: 1,
  });
  assert.equal(stats.replyRate, 0.4);
  assert.equal(stats.winRate, 0.1);
  assert.equal(stats.qualifiedToWon, 0.5);

  const empty = buildProspectAiWonStats({
    outreachSent: 0,
    replied: 0,
    qualified: 0,
    won: 0,
  });
  assert.equal(empty.replyRate, null);
  assert.equal(empty.winRate, null);
  assert.equal(empty.qualifiedToWon, null);
}

function testAttribution() {
  assert.equal(isProspectAiAttributedContact(null), false);
  assert.equal(isProspectAiAttributedContact({}), false);

  assert.equal(
    isProspectAiAttributedContact({
      sourceDetails: { prospectImportProvider: PROSPECT_AI_IMPORT_PROVIDER },
    }),
    true,
  );

  assert.equal(
    isProspectAiAttributedContact({
      customFields: { prospectAi: { placeId: "x", discoveryResultId: "r1" } },
    }),
    true,
  );

  assert.equal(
    isProspectAiAttributedContact({
      sourceDetails: {
        prospectImport: { discoverySearchId: "s1" },
      },
    }),
    true,
  );

  // GHL-style import without prospectAi meta — not attributed
  assert.equal(
    isProspectAiAttributedContact({
      sourceDetails: { prospectImportProvider: "ghl" },
      customFields: { prospectImport: { provider: "ghl" } },
      tag: "Imported-GHL",
    }),
    false,
  );
}

function testOutreachFlags() {
  assert.deepEqual(computeProspectAiOutreachFlags({ outreachStatus: "not_sent" }), {
    isSent: false,
    isReplied: false,
  });
  assert.deepEqual(computeProspectAiOutreachFlags({ outreachStatus: "outreach_sent" }), {
    isSent: true,
    isReplied: false,
  });
  assert.deepEqual(computeProspectAiOutreachFlags({ outreachStatus: "replied" }), {
    isSent: true,
    isReplied: true,
  });
  assert.deepEqual(
    computeProspectAiOutreachFlags({
      outreachStatus: "not_sent",
      outreachSentAt: new Date(),
    }),
    { isSent: true, isReplied: false },
  );
  assert.deepEqual(
    computeProspectAiOutreachFlags({
      outreachStatus: "outreach_sent",
      repliedAt: new Date(),
    }),
    { isSent: true, isReplied: true },
  );
}

function testTimeRange() {
  const now = new Date("2026-07-20T12:00:00.000Z");
  assert.equal(resolveProspectAiWonTimeRangeStart("all_time", now), null);
  assert.equal(resolveProspectAiWonTimeRangeStart(undefined, now), null);

  const month = resolveProspectAiWonTimeRangeStart("this_month", now);
  assert.ok(month);
  assert.equal(month!.toISOString(), "2026-07-01T00:00:00.000Z");

  const last30 = resolveProspectAiWonTimeRangeStart("last_30_days", now);
  assert.ok(last30);
  assert.equal(last30!.getTime(), now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

function main() {
  testOutcomesEnum();
  testRates();
  testAttribution();
  testOutreachFlags();
  testTimeRange();
  console.log("prospect-ai-won.test.ts: all passed");
}

main();
