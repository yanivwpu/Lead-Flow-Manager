/**
 * Sent Today must use workspace timezone, not server/UTC midnight.
 * Reproduces production: Aug 6 ET campaign (35+1) showed Sent Today=10 on UTC hosts.
 *
 * Run: npx tsx tests/prospect-campaign-sent-today.test.ts
 */
import assert from "node:assert/strict";
import {
  calendarDateInTimeZone,
  countProspectSentToday,
  startOfDayInTimeZone,
} from "../shared/prospectCampaignDayBoundary";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

/**
 * 35 production-shaped timestamps for one campaign run on Aug 6 America/New_York:
 * - 25 before UTC midnight (still evening ET)
 * - 10 after UTC midnight (still Aug 6 ~8:00 PM ET) — these alone produced Sent Today=10
 */
const BATCH_35_SENT_ATS = [
  ...Array.from({ length: 25 }, (_, i) => {
    const minute = String(i).padStart(2, "0");
    return `2026-08-06T22:${minute}:13.841Z`;
  }),
  "2026-08-07T00:00:05.001Z",
  "2026-08-07T00:00:12.000Z",
  "2026-08-07T00:00:20.000Z",
  "2026-08-07T00:00:30.000Z",
  "2026-08-07T00:00:40.000Z",
  "2026-08-07T00:00:50.000Z",
  "2026-08-07T00:01:00.000Z",
  "2026-08-07T00:01:05.000Z",
  "2026-08-07T00:01:13.510Z",
  "2026-08-07T00:01:22.013Z",
];

assert.equal(BATCH_35_SENT_ATS.length, 35, "fixture must be exactly 35");

const BATCH_1_SENT_AT = "2026-08-06T21:57:25.809Z";
const PREVIOUS_DAY_ET = "2026-08-06T03:59:59.000Z"; // Aug 5 23:59:59 ET

/** When user observed Sent Today=10: ~10:53 PM ET Aug 6 */
const NOW_EVENING_ET = new Date("2026-08-07T02:53:44.521Z");

run("startOfDay America/New_York on evening Aug 6 ET is Aug 6 04:00Z", () => {
  const dayStart = startOfDayInTimeZone("America/New_York", NOW_EVENING_ET);
  assert.equal(dayStart.toISOString(), "2026-08-06T04:00:00.000Z");
  assert.equal(calendarDateInTimeZone("America/New_York", NOW_EVENING_ET), "2026-08-06");
});

run("UTC server midnight (buggy) counts only 10 of 35 same-day ET sends", () => {
  const utcMidnight = new Date("2026-08-07T00:00:00.000Z");
  const items = BATCH_35_SENT_ATS.map((sentAt) => ({
    queueStatus: "sent" as const,
    sentAt: new Date(sentAt),
  }));
  const buggy = items.filter((i) => i.sentAt >= utcMidnight).length;
  assert.equal(buggy, 10);
});

run("campaign sends 35 successfully on user day → Sent Today = 35", () => {
  const items = BATCH_35_SENT_ATS.map((sentAt) => ({
    queueStatus: "sent",
    sentAt: new Date(sentAt),
  }));
  assert.equal(
    countProspectSentToday({
      items,
      timeZone: "America/New_York",
      now: NOW_EVENING_ET,
    }),
    35,
  );
});

run("additional same-day batch (+1) is included → 36", () => {
  const items = [
    ...BATCH_35_SENT_ATS.map((sentAt) => ({ queueStatus: "sent", sentAt: new Date(sentAt) })),
    { queueStatus: "sent", sentAt: new Date(BATCH_1_SENT_AT) },
  ];
  assert.equal(
    countProspectSentToday({
      items,
      timeZone: "America/New_York",
      now: NOW_EVENING_ET,
    }),
    36,
  );
});

run("previous-day sends must not be included", () => {
  const items = [
    ...BATCH_35_SENT_ATS.map((sentAt) => ({ queueStatus: "sent", sentAt: new Date(sentAt) })),
    { queueStatus: "sent", sentAt: new Date(PREVIOUS_DAY_ET) },
    { queueStatus: "sent", sentAt: new Date("2026-08-05T22:00:00.000Z") },
  ];
  assert.equal(
    countProspectSentToday({
      items,
      timeZone: "America/New_York",
      now: NOW_EVENING_ET,
    }),
    35,
  );
});

run("null sent_at and non-sent statuses are excluded", () => {
  const items = [
    { queueStatus: "sent", sentAt: new Date(BATCH_1_SENT_AT) },
    { queueStatus: "sent", sentAt: null },
    { queueStatus: "failed", sentAt: new Date(BATCH_1_SENT_AT) },
    { queueStatus: "queued", sentAt: null },
  ];
  assert.equal(
    countProspectSentToday({ items, timeZone: "America/New_York", now: NOW_EVENING_ET }),
    1,
  );
});

run("timezone boundary: just before vs after workspace midnight", () => {
  const justBefore = new Date("2026-08-06T03:59:59.999Z");
  const justAfter = new Date("2026-08-06T04:00:00.000Z");
  const now = new Date("2026-08-06T16:00:00.000Z");
  assert.equal(
    countProspectSentToday({
      items: [{ queueStatus: "sent", sentAt: justBefore }],
      timeZone: "America/New_York",
      now,
    }),
    0,
  );
  assert.equal(
    countProspectSentToday({
      items: [{ queueStatus: "sent", sentAt: justAfter }],
      timeZone: "America/New_York",
      now,
    }),
    1,
  );
});

run("all 35 batch rows are calendar Aug 6 in America/New_York", () => {
  for (const iso of BATCH_35_SENT_ATS) {
    assert.equal(calendarDateInTimeZone("America/New_York", new Date(iso)), "2026-08-06", iso);
  }
  // And 10 of them fall on UTC calendar Aug 7
  const utcAug7 = BATCH_35_SENT_ATS.filter((iso) => iso.startsWith("2026-08-07")).length;
  assert.equal(utcAug7, 10);
});

console.log("prospect-campaign-sent-today.test.ts: all assertions passed");
