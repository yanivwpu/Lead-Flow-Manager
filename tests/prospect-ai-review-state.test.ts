/**
 * Prospect AI Review work-state resolver.
 * Run: npx tsx tests/prospect-ai-review-state.test.ts
 */
import assert from "node:assert/strict";
import {
  canEnrichProspect,
  explainCanEnrichProspect,
  explainQualifiedForCampaign,
  formatProspectBulkActionResult,
  isProspectDecisionQualified,
  isProspectInCampaigns,
  isProspectInInboxJourney,
  isProspectQualifiedForCampaign,
  isProspectVisibleInReview,
  isQualifiedForEmailCampaign,
  listEmailCampaignBlockingReasons,
  matchesProspectReviewWorkFilter,
  needsHumanReview,
  PROSPECT_REVIEW_WORK_FILTER_CHIPS,
  resolveProspectNeedsAttentionReason,
  resolveProspectNeedsReviewBadge,
  resolveProspectReviewWorkState,
  summarizeSelectionActionAvailability,
} from "../shared/prospectAiReviewState";
import { resolveProspectTimelineStates } from "../shared/prospectReviewUx";
import { PROSPECT_AI_PRIMARY_TABS, PROSPECT_AI_TAB_LABELS } from "../shared/prospectAiDisplay";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

assert.deepEqual(
  [...PROSPECT_AI_PRIMARY_TABS],
  ["discover", "review", "campaign", "inbox", "won"],
);
assert.equal(PROSPECT_AI_TAB_LABELS.review, "Review");
assert.ok(!PROSPECT_AI_PRIMARY_TABS.includes("activity" as never));
assert.equal(PROSPECT_AI_TAB_LABELS.activity, "Activity");

assert.deepEqual(
  PROSPECT_REVIEW_WORK_FILTER_CHIPS.map((c) => c.label),
  ["All", "Needs Review", "Not Qualified"],
);

// Needs Review → can Enrich
assert.equal(
  canEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "none",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  }),
  true,
);

// Not Qualified is never Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "pending",
    notQualified: true,
  }),
  null,
);
assert.equal(
  resolveProspectReviewWorkState({
    analysisStatus: "completed",
    reviewStatus: "pending",
    notQualified: true,
  }),
  "not_qualified",
);

// Qualification failed → Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "failed",
    reviewStatus: "pending",
  }),
  "qualification_failed",
);

// Enrichment failed → Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
    websiteUrl: "https://example.com",
  }),
  "enrichment_failed",
);

// Website present + enrichment complete + email → Qualified
assert.equal(
  isProspectQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://example.com",
  }),
  true,
);

// No website + email → Qualified without enrichment
assert.equal(
  isProspectQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "none",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
  }),
  true,
);

// No website + no email → Needs Attention (missing contact)
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "none",
  }),
  "missing_email",
);

// Website + enrichment complete but no email → Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    websiteUrl: "https://example.com",
  }),
  "missing_email",
);

// Enrichment complete alone is NOT in Campaigns
assert.equal(
  isProspectInCampaigns({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
  }),
  false,
);

// After Send to Campaign → leave Review
assert.equal(
  isProspectVisibleInReview({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "queued",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
  }),
  false,
);

// Inbox = real thread only — not outreach_sent / replied flags alone
assert.equal(
  isProspectInInboxJourney({
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-01-01",
  }),
  false,
);
assert.equal(
  isProspectInInboxJourney({
    outreachStatus: "replied",
    repliedAt: "2026-01-02",
  }),
  false,
);
assert.equal(
  isProspectInInboxJourney({
    outreachStatus: "replied",
    repliedAt: "2026-01-02",
    outreachConversationId: "conv-1",
  }),
  true,
);
assert.equal(
  isProspectInInboxJourney({
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-01-01",
    outreachMessageId: "msg-1",
    outreachConversationId: "conv-1",
  }),
  true,
);

// Campaign timeline inactive until transfer
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
  }),
  ["done", "done", "todo"],
);
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "queued",
  }),
  ["done", "done", "current"],
);

assert.equal(
  matchesProspectReviewWorkFilter(
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      email: "a@b.com",
      suggestedFirstMessage: "Hi there,",
      websiteUrl: "https://example.com",
    },
    "qualified",
  ),
  true,
);

{
  // Needs Review filter = no Qualified / Not Qualified decision yet
  const enrichingRow = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "enriching" as const,
    websiteUrl: "https://example.com",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
  };
  const attentionRow = {
    analysisStatus: "failed" as const,
    reviewStatus: "pending" as const,
  };
  const pendingReviewRow = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://example.com",
  };
  const readyRow = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "completed" as const,
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://example.com",
  };
  const rejectedRow = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    notQualified: true as const,
    email: "a@b.com",
  };

  assert.equal(matchesProspectReviewWorkFilter(enrichingRow, "needs_review"), false);
  assert.equal(matchesProspectReviewWorkFilter(enrichingRow, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(attentionRow, "needs_review"), true);
  assert.equal(matchesProspectReviewWorkFilter(pendingReviewRow, "needs_review"), true);
  assert.equal(matchesProspectReviewWorkFilter(readyRow, "needs_review"), false);
  assert.equal(matchesProspectReviewWorkFilter(rejectedRow, "needs_review"), false);
  assert.equal(matchesProspectReviewWorkFilter(rejectedRow, "not_qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(rejectedRow, "qualified"), false);
  assert.equal(matchesProspectReviewWorkFilter(readyRow, "qualified"), true);

  // Approved + enriching + email is Qualified (enrichment is separate from status badge)
  assert.deepEqual(resolveProspectNeedsReviewBadge(enrichingRow), {
    code: "qualified",
    label: "Qualified",
  });
  assert.equal(resolveProspectReviewWorkState(enrichingRow), "enriching");
  assert.equal(resolveProspectNeedsReviewBadge(attentionRow)?.label, "AI Review Failed");
  assert.equal(
    resolveProspectNeedsReviewBadge({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "failed",
      websiteUrl: "https://example.com",
    })?.label,
    "Missing Email",
  );
  assert.equal(
    resolveProspectNeedsReviewBadge({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      websiteUrl: "https://example.com",
    })?.label,
    "Missing Email",
  );
  assert.deepEqual(resolveProspectNeedsReviewBadge(readyRow), {
    code: "qualified",
    label: "Qualified",
  });
  assert.deepEqual(resolveProspectNeedsReviewBadge(rejectedRow), { code: "not_qualified", label: "Not Qualified" });
  assert.equal(
    resolveProspectNeedsReviewBadge({
      analysisStatus: "completed",
      reviewStatus: "pending",
      enrichmentStatus: "none",
      email: "a@b.com",
      websiteUrl: "https://example.com",
    })?.label,
    "Needs Review",
  );
}

assert.equal(
  formatProspectBulkActionResult("enrich", {
    selected: 18,
    succeeded: 12,
    skipped: 4,
    failed: 2,
  }),
  "18 selected · 12 enrichment jobs started · 4 skipped · 2 failed",
);
assert.equal(
  formatProspectBulkActionResult("enrich", {
    selected: 2,
    succeeded: 2,
    skipped: 0,
    failed: 0,
  }),
  "2 enrichment jobs started.",
);
assert.equal(
  formatProspectBulkActionResult("enrich", {
    selected: 1,
    succeeded: 1,
    skipped: 0,
    failed: 0,
  }),
  "1 enrichment job started.",
);

{
  const blocked = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "completed",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  });
  // needsReview without Qualified decision blocks campaign send
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "needs_review");
  assert.equal(
    needsHumanReview({
      analysisStatus: "completed",
      reviewStatus: "needs_review",
      needsReview: true,
      enrichmentStatus: "completed",
      email: "a@b.com",
    }),
    true,
  );
}

{
  // Missing phone must not block Email campaign (phone is not in hard gates)
  const ok = isQualifiedForEmailCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    needsReview: true,
    enrichmentStatus: "completed",
    email: "sales@example.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://example.com",
  });
  assert.equal(ok, true);
  assert.deepEqual(
    listEmailCampaignBlockingReasons({
      analysisStatus: "completed",
      reviewStatus: "approved",
      needsReview: true,
      enrichmentStatus: "completed",
      email: "sales@example.com",
      suggestedFirstMessage: "Hi there,",
      websiteUrl: "https://example.com",
    }),
    [],
  );
}

{
  const noEmail = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    websiteUrl: "https://example.com",
  });
  assert.equal(noEmail.ok, false);
  assert.equal(noEmail.code, "missing_email");
  assert.match(noEmail.message, /Email required|Missing email/i);
}

{
  // Human Not Qualified (no approval evidence) blocks campaign
  const dismissed = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "completed",
    email: "a@b.com",
    notQualified: true,
  });
  assert.equal(dismissed.ok, false);
  assert.equal(dismissed.code, "not_qualified");
}

{
  // AI not_a_fit cannot override prior human Approve
  const approvedWins = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    notQualified: true,
  });
  assert.equal(approvedWins.ok, true);
}

{
  const qualFailed = explainQualifiedForCampaign({
    analysisStatus: "failed",
    reviewStatus: "pending",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
  });
  assert.equal(qualFailed.ok, false);
  assert.equal(qualFailed.code, "qualification_failed");
}

{
  // Enrichment failed but email available → Email campaign still allowed
  const enrichFailWithEmail = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://example.com",
  });
  assert.equal(enrichFailWithEmail.ok, true);
}

{
  // Enrichment failed and no email → block
  const enrichFailNoEmail = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
    websiteUrl: "https://example.com",
  });
  assert.equal(enrichFailNoEmail.ok, false);
  assert.ok(
    enrichFailNoEmail.code === "enrichment_failed" ||
      enrichFailNoEmail.code === "missing_email",
  );
}

{
  // Needs Review + website → Enrich enabled (Enrich IS the approval decision)
  const needsReviewEnrichable = {
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "none",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  } as const;
  assert.equal(canEnrichProspect(needsReviewEnrichable), true);
  assert.equal(explainCanEnrichProspect(needsReviewEnrichable).ok, true);
  assert.equal(explainCanEnrichProspect(needsReviewEnrichable).code, "ok");
  // Same shared resolver for toolbar + detail — identical eligibility
  assert.deepEqual(
    explainCanEnrichProspect(needsReviewEnrichable),
    explainCanEnrichProspect({ ...needsReviewEnrichable }),
  );
}

{
  // Already enriched under Needs Review → Enrich blocked with real reason (not "needs decision")
  const enrichBlocked = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "completed",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  });
  assert.equal(enrichBlocked.ok, false);
  assert.equal(enrichBlocked.code, "already_enriched");
}

{
  // Missing enrichment prerequisite → real blocker, not contradictory "enrich first"
  const noWebsite = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "none",
  });
  assert.equal(noWebsite.ok, false);
  assert.equal(noWebsite.code, "missing_website");
  assert.match(noWebsite.message, /No website available to enrich/i);

  const qualFailed = explainCanEnrichProspect({
    analysisStatus: "failed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "none",
    websiteUrl: "https://example.com",
  });
  assert.equal(qualFailed.ok, false);
  assert.equal(qualFailed.code, "qualification_failed");
  assert.match(qualFailed.message, /AI Review failed|Qualification failed/i);

  const alreadyEnriching = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "pending",
    websiteUrl: "https://example.com",
  });
  assert.equal(alreadyEnriching.ok, false);
  assert.equal(alreadyEnriching.code, "enrichment_in_progress");
  assert.match(alreadyEnriching.message, /Already enriching/i);
}

{
  // After Enrich (approve) → Enriching work state
  assert.equal(
    resolveProspectReviewWorkState({
      analysisStatus: "completed",
      reviewStatus: "approved",
      needsReview: false,
      enrichmentStatus: "pending",
      websiteUrl: "https://example.com",
      email: "a@b.com",
      suggestedFirstMessage: "Hi there,",
    }),
    "enriching",
  );
}

{
  // Send copy: "Enrich this prospect…" only when Enrich is actually available
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true,
    enrichmentStatus: "none" as const,
    email: "a@b.com",
    websiteUrl: "https://example.com",
  };
  const enrich = explainCanEnrichProspect(ux);
  const qualified = explainQualifiedForCampaign(ux);
  assert.equal(enrich.ok, true);
  assert.equal(qualified.ok, false);
  assert.equal(qualified.code, "needs_review");
  const avail = summarizeSelectionActionAvailability({
    selectedCount: 1,
    enrichableCount: 1,
    qualifiedCount: 0,
    firstEnrich: enrich,
    firstQualified: qualified,
  });
  assert.match(avail.reason || "", /Needs review/i);
  assert.equal(avail.line, "1 selected");

  const blockedUx = {
    analysisStatus: "failed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true,
    enrichmentStatus: "none" as const,
    websiteUrl: "https://example.com",
  };
  const blockedEnrich = explainCanEnrichProspect(blockedUx);
  const blockedQualified = explainQualifiedForCampaign(blockedUx);
  const blockedAvail = summarizeSelectionActionAvailability({
    selectedCount: 1,
    enrichableCount: 0,
    qualifiedCount: 0,
    firstEnrich: blockedEnrich,
    firstQualified: blockedQualified,
  });
  assert.equal(blockedEnrich.ok, false);
  assert.match(blockedAvail.reason || "", /Qualification failed/i);
  assert.ok(!/Enrich this prospect/i.test(blockedAvail.reason || ""));
}

{
  const already = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://example.com",
  });
  assert.equal(already.ok, false);
  assert.equal(already.code, "already_enriched");
}

{
  // Campaign hard gates: Qualified decision required; email unlocks without enrichment.
  const cases: Array<{ name: string; input: Parameters<typeof isQualifiedForEmailCampaign>[0]; expectOk: boolean; code?: string }> = [
    {
      name: "enriched + email + needsReview without Qualified decision",
      input: {
        analysisStatus: "completed",
        reviewStatus: "needs_review",
        needsReview: true,
        enrichmentStatus: "completed",
        email: "a@b.com",
        websiteUrl: "https://example.com",
      },
      expectOk: false,
      code: "needs_review",
    },
    {
      name: "enriched + email + Qualified decision",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "completed",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        websiteUrl: "https://example.com",
      },
      expectOk: true,
    },
    {
      name: "Qualified + manual email + website without enrichment",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "none",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        websiteUrl: "https://example.com",
      },
      expectOk: true,
    },
    {
      name: "enriched + no email",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "completed",
        websiteUrl: "https://example.com",
      },
      expectOk: false,
      code: "missing_email",
    },
    {
      name: "not qualified + email (human reject, no approval evidence)",
      input: {
        analysisStatus: "completed",
        reviewStatus: "pending",
        enrichmentStatus: "completed",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        notQualified: true,
      },
      expectOk: false,
      code: "not_qualified",
    },
    {
      name: "AI not_a_fit cannot override approved decision",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "completed",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        notQualified: true,
      },
      expectOk: true,
    },
    {
      name: "enrichment in progress without email",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "pending",
        websiteUrl: "https://example.com",
      },
      expectOk: false,
      code: "missing_email",
    },
    {
      name: "enrichment in progress with email is still campaign-eligible",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "pending",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        websiteUrl: "https://example.com",
      },
      expectOk: true,
    },
    {
      name: "already contacted (traceable message)",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "completed",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        websiteUrl: "https://example.com",
        outreachStatus: "outreach_sent",
        outreachSentAt: "2026-01-01",
        outreachMessageId: "msg-1",
      },
      expectOk: false,
      code: "already_contacted",
    },
    {
      name: "already contacted (server priorOutreachDetected)",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "completed",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        websiteUrl: "https://example.com",
        priorOutreachDetected: true,
      },
      expectOk: false,
      code: "already_contacted",
    },
    {
      name: "stale outreach_sent alone is still campaign-eligible",
      input: {
        analysisStatus: "completed",
        reviewStatus: "approved",
        enrichmentStatus: "completed",
        email: "a@b.com",
        suggestedFirstMessage: "Hi there,",
        websiteUrl: "https://example.com",
        outreachStatus: "outreach_sent",
        outreachSentAt: "2026-01-01",
      },
      expectOk: true,
    },
  ];

  for (const c of cases) {
    const qualified = isQualifiedForEmailCampaign(c.input);
    const explain = explainQualifiedForCampaign(c.input);
    assert.equal(qualified, c.expectOk, c.name);
    assert.equal(explain.ok, c.expectOk, c.name);
    if (c.expectOk) {
      assert.equal(isProspectDecisionQualified(c.input), true, c.name);
      assert.equal(listEmailCampaignBlockingReasons(c.input).length, 0, c.name);
    } else {
      assert.ok(listEmailCampaignBlockingReasons(c.input).length > 0, c.name);
      if (c.code) assert.equal(explain.code, c.code, c.name);
    }
  }

  // Advisory needsReview alone never blocks once Qualified decision + email exist
  const advisoryQualified = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    needsReview: true,
    enrichmentStatus: "completed" as const,
    email: "ready@example.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://shop.example.com",
  };
  assert.equal(isQualifiedForEmailCampaign(advisoryQualified), true);
  assert.equal(needsHumanReview(advisoryQualified), true);
  assert.equal(listEmailCampaignBlockingReasons(advisoryQualified).length, 0);
}

{
  // Already enriched + Send ready → no noisy Enrich "reason"
  const avail = summarizeSelectionActionAvailability({
    selectedCount: 1,
    enrichableCount: 0,
    qualifiedCount: 1,
    firstEnrich: {
      ok: false,
      code: "already_enriched",
      message: "This prospect is already enriched.",
    },
    firstQualified: { ok: true, code: "ok", message: "" },
  });
  assert.equal(avail.reason, null);
}

const pageSrc = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
assert.ok(pageSrc.includes("PROSPECT_AI_PRIMARY_TABS"));
assert.ok(pageSrc.includes("InboxTab") || pageSrc.includes('value="inbox"'));
assert.ok(pageSrc.includes("prospect-ai-activity-link"));
assert.ok(pageSrc.includes("PROSPECT_AI_TAB_LABELS.activity"));
assert.ok(!pageSrc.includes('["activity", PROSPECT_AI_TAB_LABELS.activity]'));
assert.ok(pageSrc.includes('value="activity"')); // secondary destination still mounted

const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(panelSrc.includes("PROSPECT_REVIEW_WORK_FILTER_CHIPS"));
assert.ok(!panelSrc.includes("PROSPECT_REVIEW_FILTER_CHIPS"));
assert.ok(!panelSrc.includes("PROSPECT_NEEDS_ATTENTION_SUB_FILTERS"));
assert.ok(!panelSrc.includes("pi-attention-subfilters"));
assert.ok(panelSrc.includes("resolveProspectNeedsReviewBadge"));
assert.ok(panelSrc.includes("NeedsReviewReasonBadge"));
assert.ok(!panelSrc.includes("Approve to enrich"));
assert.ok(panelSrc.includes("Enrich") || panelSrc.includes("pi-enrich"));
assert.ok(panelSrc.includes("pi-selection-reason") || panelSrc.includes("availability.reason"));
assert.ok(panelSrc.includes("onStartEnrichment") || panelSrc.includes("startProspectEnrichment"));
assert.ok(!panelSrc.includes("pi-campaigns-subfilters"));
// Needs Review is a badge/state via primary status resolver; detail Enrich uses shared canEnrichProspect
assert.ok(panelSrc.includes("resolveProspectDetailPrimaryStatus"));
assert.ok(panelSrc.includes("pi-qualification-controls"));
assert.ok(panelSrc.includes("pi-qualify-qualified"));
assert.ok(panelSrc.includes("pi-qualify-not-qualified"));
assert.ok(!panelSrc.includes("pi-qualify-needs-review"));
assert.ok(panelSrc.includes("canEnrichProspect(reviewUxInput"));
assert.ok(panelSrc.includes("explainCanEnrichProspect(reviewUxInput"));
assert.ok(panelSrc.includes("detailCanEnrich"));
assert.ok(panelSrc.includes("explainCanEnrichProspect(ux)"));
assert.ok(panelSrc.includes("pi-enrich-blocked-reason"));
assert.ok(!panelSrc.includes("pi-enrich-disabled-button"));
assert.ok(!panelSrc.includes('setWorkFilter("enriching")'));
assert.ok(!panelSrc.includes("attentionSubFilter"));
assert.ok(!panelSrc.includes("detailAlreadyNeedsReview"));
assert.ok(!panelSrc.includes('data-testid="pi-not-qualified-button"'));
// Send to Campaign modal — human copy, not queue jargon
assert.ok(panelSrc.includes("Send to Campaign"));
assert.ok(panelSrc.includes("Send {queuePreview?.willQueue ?? 0} to Campaign") || panelSrc.includes("to Campaign"));
assert.ok(!panelSrc.includes("Queue outreach confirmation"));
assert.ok(!panelSrc.includes("Preferred channel: Auto"));
assert.ok(!panelSrc.includes("bulk-enabled channel"));
assert.ok(!panelSrc.includes("frozen at queue time"));
assert.ok(panelSrc.includes("groupCampaignSkipReasons"));
assert.ok(panelSrc.includes("ready for Campaign"));

const campaignsSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(campaignsSrc.includes("PROSPECT_CAMPAIGN_STATUS_FILTERS"));
assert.ok(campaignsSrc.includes("PROSPECT_CAMPAIGN_CONTROL_LABELS.startSending"));
assert.ok(campaignsSrc.includes("groupProspectCampaignBatches"));
assert.ok(campaignsSrc.includes("po-campaign-batches"));
assert.ok(!campaignsSrc.includes('["sending", "Sending"]'));

console.log("prospect-ai-review-state.test.ts: all assertions passed");
