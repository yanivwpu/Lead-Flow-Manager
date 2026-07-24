/**
 * Prior-outreach / Qualified / Send invariant regressions.
 * Run: npx tsx tests/prospect-prior-outreach-qualified.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectPriorProspectOutreach,
} from "../shared/prospectPriorOutreach";
import {
  hasTraceableProspectCampaignHistory,
  hasTraceableProspectOutreachSend,
} from "../shared/prospectTraceableOutreach";
import {
  explainQualifiedForCampaign,
  isQualifiedForEmailCampaign,
  listEmailCampaignBlockingReasons,
  matchesProspectReviewWorkFilter,
} from "../shared/prospectAiReviewState";

const baseQualified = {
  analysisStatus: "completed" as const,
  reviewStatus: "needs_review" as const,
  needsReview: true,
  enrichmentStatus: "completed" as const,
  email: "a@b.com",
  websiteUrl: "https://example.com",
};

// A. Real manual/historical outbound conversation, no PI message id, no queue
{
  const prior = detectPriorProspectOutreach({
    outreachStatus: "not_sent",
    outreachConversationId: null,
    outreachMessageId: null,
    outreachSentAt: null,
    emailConversations: [
      {
        id: "conv-win",
        subject: "Idea for W.i.n. Marketing Agency",
        hasOutbound: true,
      },
    ],
    hasSuccessfulQueueSend: false,
  });
  assert.equal(prior.alreadyContacted, true);
  assert.equal(prior.reason, "manual_outreach_conversation");

  const ux = {
    ...baseQualified,
    outreachStatus: "not_sent" as const,
    priorOutreachDetected: true as const,
  };
  assert.equal(hasTraceableProspectOutreachSend(ux), true);
  assert.equal(isQualifiedForEmailCampaign(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), false);
  assert.equal(explainQualifiedForCampaign(ux).code, "already_contacted");
  assert.ok(
    listEmailCampaignBlockingReasons(ux).some((b) => b.code === "already_contacted"),
  );
  assert.equal(hasTraceableProspectCampaignHistory(ux), true);
}

// B. Queue sent → same result
{
  const prior = detectPriorProspectOutreach({
    outreachStatus: "not_sent",
    hasSuccessfulQueueSend: true,
  });
  assert.equal(prior.alreadyContacted, true);
  assert.equal(prior.reason, "queue_already_sent");

  const ux = { ...baseQualified, queueStatus: "sent" as const };
  assert.equal(hasTraceableProspectOutreachSend(ux), true);
  assert.equal(isQualifiedForEmailCampaign(ux), false);
  assert.equal(explainQualifiedForCampaign(ux).code, "already_contacted");
}

// C. Stale outreach_sent only, no real send evidence
{
  const prior = detectPriorProspectOutreach({
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-01-01T00:00:00.000Z",
    emailConversations: [],
    hasSuccessfulQueueSend: false,
  });
  assert.equal(prior.alreadyContacted, false);
  assert.equal(prior.reason, "ok");

  const ux = {
    ...baseQualified,
    outreachStatus: "outreach_sent" as const,
    outreachSentAt: "2026-01-01T00:00:00.000Z",
    priorOutreachDetected: false as const,
  };
  assert.equal(hasTraceableProspectOutreachSend(ux), false);
  assert.equal(isQualifiedForEmailCampaign(ux), true);
  assert.ok(
    !listEmailCampaignBlockingReasons(ux).some((b) => b.code === "already_contacted"),
  );
}

// D. Invariant: every Qualified prospect must not be already_contacted for Send
{
  const candidates = [
    { ...baseQualified },
    { ...baseQualified, reviewStatus: "approved" as const, needsReview: false },
    {
      ...baseQualified,
      outreachStatus: "outreach_sent" as const,
      outreachSentAt: "2026-01-01",
      // stale only
    },
    {
      ...baseQualified,
      priorOutreachDetected: true as const,
    },
    {
      ...baseQualified,
      outreachMessageId: "msg-1",
    },
    {
      ...baseQualified,
      queueStatus: "sent" as const,
    },
  ];

  for (const input of candidates) {
    if (!isQualifiedForEmailCampaign(input)) continue;
    const blocks = listEmailCampaignBlockingReasons(input);
    assert.ok(
      !blocks.some((b) => b.code === "already_contacted"),
      `Qualified must not be already_contacted: ${JSON.stringify(input)}`,
    );
  }
}

// E. Campaign progress: real historical send → Campaign ✓
{
  assert.equal(
    hasTraceableProspectCampaignHistory({
      priorOutreachDetected: true,
    }),
    true,
  );
  assert.equal(
    hasTraceableProspectCampaignHistory({
      outreachMessageId: "msg-1",
      outreachConversationId: "conv-1",
    }),
    true,
  );
}

// Wiring: list API + panel pass priorOutreachDetected
{
  const listSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(listSrc.includes("batchLoadPriorOutreachFlags"));
  assert.ok(listSrc.includes("priorOutreachDetected"));
  assert.ok(listSrc.includes("linkProspectPriorOutreachHistory"));

  const panelSrc = readFileSync(
    join(import.meta.dirname, "..", "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panelSrc.includes("priorOutreachDetected: row.priorOutreachDetected === true"));

  const queueSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(queueSrc.includes("batchLoadPriorOutreachFlags"));
  assert.ok(queueSrc.includes("inbox_outreach"));

  const eligSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachEligibilityService.ts"),
    "utf8",
  );
  assert.ok(eligSrc.includes("linkProspectPriorOutreachHistory"));
  assert.ok(!eligSrc.includes("markProspectOutreachSent({"));
}

console.log("prospect-prior-outreach-qualified.test.ts: all assertions passed");
