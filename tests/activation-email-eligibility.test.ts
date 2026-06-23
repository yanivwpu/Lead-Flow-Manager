import assert from "node:assert/strict";
import {
  activationStartAt,
  daysSinceActivationStart,
  fullCalendarDaysSince,
  isExcludedFromActivationEmails,
} from "../shared/activationEmailEligibility";

function testActivationStartPrefersShopifyInstall() {
  const start = activationStartAt({
    createdAt: "2026-05-20T04:39:06.107Z",
    trialStartedAt: "2026-05-20T04:39:06.103Z",
    shopifyInstalledAt: "2026-06-22T05:34:54.343Z",
  });
  assert.equal(start?.toISOString(), "2026-06-22T05:34:54.343Z");
}

function testFullCalendarDays() {
  const start = new Date("2026-06-19T23:00:00.000Z");
  const day2 = new Date("2026-06-21T01:00:00.000Z");
  const day3 = new Date("2026-06-22T10:00:00.000Z");
  assert.equal(fullCalendarDaysSince(start, day2), 2);
  assert.equal(fullCalendarDaysSince(start, day3), 3);
}

function testDaysSinceActivationStart() {
  const now = new Date("2026-06-22T10:00:00.000Z");
  const days = daysSinceActivationStart(
    { shopifyInstalledAt: "2026-06-22T05:34:54.343Z" },
    now,
  );
  assert.equal(days, 0);
}

function testExcludedEmails() {
  assert.equal(isExcludedFromActivationEmails("yanivharamaty@gmail.com"), true);
  assert.equal(isExcludedFromActivationEmails("whachatcrm@shopify.whachatcrm.com"), true);
  assert.equal(isExcludedFromActivationEmails("foo@test.com"), true);
  assert.equal(isExcludedFromActivationEmails("customer@example.com"), false);
}

testActivationStartPrefersShopifyInstall();
testFullCalendarDays();
testDaysSinceActivationStart();
testExcludedEmails();

console.log("activation-email-eligibility.test.ts: ok");
