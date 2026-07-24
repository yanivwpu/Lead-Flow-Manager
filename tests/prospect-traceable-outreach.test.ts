/**
 * Traceable outreach vs legacy outreach_sent flags.
 * Run: npx tsx tests/prospect-traceable-outreach.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasStaleProspectOutreachLifecycleFlags,
  hasTraceableProspectCampaignHistory,
  hasTraceableProspectInboxThread,
  hasTraceableProspectOutreachSend,
} from "../shared/prospectTraceableOutreach";
import {
  resolveProspectDisplayStatus,
  resolveProspectOutreachLifecycleUi,
} from "../shared/prospectOutreachLifecycle";
import { resolveProspectTimelineStates, resolveProspectReviewLifecycle } from "../shared/prospectReviewUx";
import { resolveProspectApproveOutreachUi } from "../shared/prospectContactEnrichment";

// Legacy outreach_sent with no message/queue → not traceable
{
  const stale = {
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-07-14T17:56:43.059Z",
  };
  assert.equal(hasTraceableProspectOutreachSend(stale), false);
  assert.equal(hasTraceableProspectCampaignHistory(stale), false);
  assert.equal(hasTraceableProspectInboxThread(stale), false);
  assert.equal(hasStaleProspectOutreachLifecycleFlags(stale), true);

  assert.deepEqual(
    resolveProspectTimelineStates({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      ...stale,
    }),
    ["done", "done", "todo"],
  );
  assert.notEqual(
    resolveProspectReviewLifecycle({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      ...stale,
    }),
    "inbox",
  );

  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "approved",
    ...stale,
    email: "a@b.com",
  });
  assert.equal(ui.isOutreachSentOrLater, false);
  assert.equal(ui.showViewThread, false);
  assert.equal(resolveProspectDisplayStatus({ reviewStatus: "approved", ...stale }), "approved");
}

// Real historical Inbox send (message id) → traceable
{
  const historical = {
    outreachStatus: "outreach_sent" as const,
    outreachSentAt: "2026-07-14T17:56:43.059Z",
    outreachMessageId: "msg-1",
    outreachConversationId: "conv-1",
  };
  assert.equal(hasTraceableProspectOutreachSend(historical), true);
  assert.equal(hasTraceableProspectCampaignHistory(historical), true);
  assert.equal(hasTraceableProspectInboxThread(historical), true);
  assert.equal(hasStaleProspectOutreachLifecycleFlags(historical), false);

  assert.deepEqual(
    resolveProspectTimelineStates({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      ...historical,
    }),
    ["done", "done", "done"],
  );
  assert.equal(
    resolveProspectReviewLifecycle({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      ...historical,
    }),
    "inbox",
  );

  const ui = resolveProspectOutreachLifecycleUi({
    reviewStatus: "approved",
    ...historical,
    hasValidEmail: true,
  });
  assert.equal(ui.isOutreachSentOrLater, true);
  assert.equal(ui.showViewThread, true);
}

// Server priorOutreachDetected (Idea-for outbound without PI message id) → traceable
{
  const ideaOnly = { priorOutreachDetected: true as const };
  assert.equal(hasTraceableProspectOutreachSend(ideaOnly), true);
  assert.equal(hasTraceableProspectCampaignHistory(ideaOnly), true);
}

// Queue sent → Campaign ✓ + sent messaging
{
  const queued = {
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "sent",
  };
  assert.equal(hasTraceableProspectOutreachSend(queued), true);
  assert.deepEqual(resolveProspectTimelineStates(queued), ["done", "done", "done"]);
}

const panelSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(panelSrc.includes("approveUi.isOutreachSentOrLater"));
assert.ok(panelSrc.includes("outreachMessageId"));

const queueSrc = readFileSync(
  join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
  "utf8",
);
assert.ok(queueSrc.includes("inbox_outreach"));
assert.ok(queueSrc.includes("batchLoadPriorOutreachFlags"));

console.log("prospect-traceable-outreach.test.ts: all assertions passed");
