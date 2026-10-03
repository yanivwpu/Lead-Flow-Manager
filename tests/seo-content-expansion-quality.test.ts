import assert from "node:assert/strict";
import { buildContentExpansionPacket, generateAndReviewContentExpansion, reviewContentExpansion, type ContentExpansionCopywriter, type ContentExpansionEvidence } from "../server/seo/contentExpansionQuality";

const body = `WhatsApp Business automated messages help a team respond consistently when a customer starts a conversation. The automation workflow can send a welcome message, collect the customer's request, and route the conversation to a shared inbox. Team members can review the conversation and follow up from the inbox. An away message can set expectations outside business hours. Keep messages clear, give customers a useful next step, and offer a route to a person when the workflow cannot answer the request. Automation should support a conversation rather than repeat the same message. Review each workflow before publishing and update it when the customer journey changes. The page also explains how message templates and customer conversations fit into a practical WhatsApp workflow.`;
const evidence: ContentExpansionEvidence = {
  pageUrl: "https://example.com/blog/whatsapp-automation",
  title: "WhatsApp Business Automation Guide",
  metaDescription: "Learn how WhatsApp automation supports welcome messages, routing, and timely team follow-up.",
  headings: ["WhatsApp Business Automation", "Plan an automated message workflow", "Keep a person available", "Review your workflow"],
  bodyText: body,
  pageType: "striking_distance",
  queryCluster: ["whatsapp business automated messages"],
  fingerprint: "a".repeat(64),
  metrics: { clicks: 12, impressions: 840, ctr: .014, position: 8.4 },
};

const actualDraft = `## How to plan WhatsApp Business automated messages

Start with the moment that triggers the conversation. A welcome message can acknowledge a customer who starts a conversation, while an away message can set clear expectations outside business hours. Keep each message focused on the customer’s immediate request and include a useful next step instead of repeating the same greeting.

Connect the message to a simple workflow. Collect the customer’s request, route the conversation to the shared inbox, and let a team member review the conversation before following up. When the workflow cannot answer the request, make the route to a person clear. This keeps automation useful without treating every conversation as identical.

Review the complete customer journey before publishing the workflow. Check that the welcome message, routing step, and follow-up work together, and remove repeated instructions that slow the conversation down. As customer questions change, update the workflow and its messages so that the response remains clear, timely, and relevant.`;

const copywriter: ContentExpansionCopywriter = { provider: "test", model: "grounded", async generate() { return { proposedContent: actualDraft, insertionLocation: "Insert after: Plan an automated message workflow", rationale: "Adds a practical, evidence-based answer for visitors planning automated messages." }; } };
const generated = await generateAndReviewContentExpansion(evidence, copywriter);
assert.equal(generated.decision, "accept");
assert.equal(generated.candidate.proposedContent, actualDraft, "the exact visitor-facing draft is retained");
assert.doesNotMatch(generated.candidate.proposedContent, /^Expand the existing page with an original section/i);
assert.equal(generated.packet.searchConsole.queryCluster[0], "whatsapp business automated messages");
assert.equal(generated.packet.contentFingerprint, evidence.fingerprint);
assert.match(generated.packet.currentPageExcerpt, /automated messages|automation workflow/i);

const unsupported = reviewContentExpansion({ proposedContent: `${actualDraft} The platform guarantees 100% more sales and includes Shopify.`, insertionLocation: "Insert after: Plan an automated message workflow", rationale: "More detail." }, evidence);
assert.equal(unsupported.accepted, false);
assert.ok(unsupported.reasons.some(reason => reason.startsWith("unsupported")));

const duplicated = reviewContentExpansion({ proposedContent: `${body} ${body}`, insertionLocation: "Insert after: Plan an automated message workflow", rationale: "Repeats the page." }, evidence);
assert.equal(duplicated.accepted, false);
assert.ok(duplicated.reasons.includes("duplicates_existing_content"));

const generic = reviewContentExpansion({ proposedContent: "Expand the existing page with an original section that answers the target query. ".repeat(22), insertionLocation: "Insert after: Workflow", rationale: "SEO coverage." }, evidence);
assert.equal(generic.accepted, false);
assert.ok(generic.reasons.includes("generic_or_weak"));

const failed = await generateAndReviewContentExpansion(evidence, { provider: "test", model: "failure", async generate() { throw new Error("provider unavailable"); } });
assert.equal(failed.decision, "no_material_improvement", "provider failure cannot create a fallback action");
assert.deepEqual(failed.audit.reviewerScores[0].rejectionReasons, ["ai_provider_failure_or_malformed_json"]);

const longText = "Team inbox notes and workflow routing ".repeat(30);
assert.equal(buildContentExpansionPacket({ ...evidence, bodyText: longText }).currentPageText, longText,
  "long source blocks and feature lists are retained even when sentence extraction omits them");
let listCalls = 0;
await generateAndReviewContentExpansion({ ...evidence, headings: [evidence.headings[0]], bodyText: longText }, {
  provider: "test", model: "lists", async generate(packet) {
    listCalls++;
    assert.equal(packet.currentPageText, longText);
    return copywriter.generate(packet);
  },
});
assert.ok(listCalls > 0, "substantial list evidence reaches the writer instead of failing sentence extraction");
let sparseCalls = 0;
await generateAndReviewContentExpansion({ ...evidence, headings: [evidence.headings[0]], bodyText: "A short label." }, {
  provider: "test", model: "sparse", async generate(packet) { sparseCalls++; return copywriter.generate(packet); },
});
assert.equal(sparseCalls, 0, "a page with too little evidence remains blocked");

const withoutAi = { ...evidence, headings: evidence.headings.map(text => text.replace(/\w*ai\w*/gi, "context")), bodyText: body.replace(/\w*ai\w*/gi, "context") };
const detailDraft = { proposedContent: actualDraft + " Explain the details before configuring a workflow.", insertionLocation: "Insert after: Review your workflow", rationale: "Adds grounded guidance." };
assert.ok(!reviewContentExpansion(detailDraft, withoutAi).reasons.includes("unsupported_fact:ai"),
  "AI is matched as a feature token, not a substring inside explain, details, or remains");
assert.ok(reviewContentExpansion({ ...detailDraft, proposedContent: detailDraft.proposedContent + " AI generates replies." }, withoutAi).reasons.includes("unsupported_fact:ai"));

let revisionCalls = 0;
const revised = await generateAndReviewContentExpansion(evidence, { provider: "test", model: "reviser", async generate(_packet, revision) {
  revisionCalls++;
  if (!revision) return { proposedContent: "Generic short draft.", insertionLocation: "Insert after: Review your workflow", rationale: "Too short." };
  assert.ok(revision.rejectionReasons.includes("inappropriate_length"));
  assert.equal(revision.previousDraft, "Generic short draft.");
  return copywriter.generate(_packet);
} });
assert.equal(revised.decision, "accept");
assert.equal(revisionCalls, 2);
assert.equal(revised.audit.selectedCandidateIndex, 1);

let rejectedCalls = 0;
const rejected = await generateAndReviewContentExpansion(evidence, { provider: "test", model: "rejected", async generate() {
  rejectedCalls++;
  return { proposedContent: "Generic short draft.", insertionLocation: "Insert after: Review your workflow", rationale: "Too short." };
} });
assert.equal(rejected.decision, "no_material_improvement");
assert.equal(rejectedCalls, 2, "revisions are capped and cannot bypass quality checks");

console.log("seo content expansion quality tests passed");
