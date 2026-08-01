/**
 * Campaigns draft management — row detail, edit/regen APIs, multi-select (no auto-send).
 * Run: npx tsx tests/prospect-campaign-draft-management.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countQueuedDraftsWithUnresolvedTokens,
  extractCampaignDraftTokens,
  isCampaignDraftEditable,
} from "../shared/prospectCampaignDraftTokens";

{
  assert.deepEqual(
    extractCampaignDraftTokens("Hi {{first_name}}", "See {company} and {{first_name}}"),
    ["company", "first_name"],
  );
  assert.deepEqual(extractCampaignDraftTokens("Hi Luca", "Fully written draft."), []);
  assert.equal(isCampaignDraftEditable("queued"), true);
  assert.equal(isCampaignDraftEditable("paused"), true);
  assert.equal(isCampaignDraftEditable("failed"), true);
  assert.equal(isCampaignDraftEditable("sending"), false);
  assert.equal(isCampaignDraftEditable("sent"), false);
  assert.equal(
    countQueuedDraftsWithUnresolvedTokens([
      { queueStatus: "queued", unresolvedTokenCount: 2 },
      { queueStatus: "queued", unresolvedTokenCount: 0 },
      { queueStatus: "sent", unresolvedTokenCount: 3 },
      { queueStatus: "failed", unresolvedTokenCount: 1 },
    ]),
    1,
  );
}

const panelSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
const dialogSrc = readFileSync(
  join(import.meta.dirname, "..", "client/src/components/settings/CampaignQueueDraftDialog.tsx"),
  "utf8",
);
const routesSrc = readFileSync(
  join(import.meta.dirname, "..", "server/routes/prospectBulkOutreach.ts"),
  "utf8",
);
const serviceSrc = readFileSync(
  join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
  "utf8",
);
const rewriteSrc = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "server/prospectImport/prospectOutreachDraftRewriteService.ts",
  ),
  "utf8",
);

// Detail dialog + actions
assert.ok(panelSrc.includes("CampaignQueueDraftDialog"));
assert.ok(panelSrc.includes("openDraftDetail"));
assert.ok(dialogSrc.includes("po-draft-dialog"));
assert.ok(dialogSrc.includes("po-draft-edit"));
assert.ok(dialogSrc.includes("po-draft-save"));
assert.ok(dialogSrc.includes("po-draft-regenerate"));
assert.ok(dialogSrc.includes("po-draft-preview"));
assert.ok(dialogSrc.includes("po-draft-delete"));
assert.ok(dialogSrc.includes("po-draft-ai-summary"));
assert.ok(dialogSrc.includes("po-draft-tokens"));
assert.ok(dialogSrc.includes("po-draft-prospect-info"));
assert.ok(dialogSrc.includes("po-draft-readonly"));
assert.ok(dialogSrc.includes("po-draft-tokens-warning"));
assert.ok(dialogSrc.includes("max-h-[90dvh]"));
assert.ok(dialogSrc.includes("overflow-y-auto"));

// Checkbox / row click isolation
assert.match(
  panelSrc,
  /TableCell className="w-10" onClick=\{\(e\) => e\.stopPropagation\(\)\}/,
);
assert.ok(panelSrc.includes("onClick={() => openDraftDetail(row)}"));
assert.ok(!panelSrc.includes("toggleRowSelected") || panelSrc.includes("stopPropagation"));

// Multi-select — working actions only (no stub Send now / Pause)
assert.ok(panelSrc.includes("po-select-all"));
assert.ok(panelSrc.includes("po-bulk-toolbar"));
assert.ok(panelSrc.includes("po-bulk-regenerate"));
assert.ok(panelSrc.includes("po-bulk-delete"));
assert.ok(panelSrc.includes("Regenerate selected"));
assert.ok(panelSrc.includes("Delete selected"));
assert.ok(panelSrc.includes("window.confirm"));
assert.ok(!panelSrc.includes("po-bulk-send-now"));
assert.ok(!panelSrc.includes("po-bulk-pause"));
assert.ok(!panelSrc.includes("Coming soon"));
assert.ok(!/Send now/.test(panelSrc.replace(/Start Sending/g, "")));

// Unresolved token warning before Start Sending
assert.ok(panelSrc.includes("po-unresolved-tokens-warning"));
assert.ok(panelSrc.includes("countQueuedDraftsWithUnresolvedTokens"));
assert.ok(panelSrc.includes("Start sending anyway?"));
assert.ok(serviceSrc.includes("unresolvedTokenCount"));

// Sent / sending never deleted
assert.ok(serviceSrc.includes('already_sent_or_sending'));
assert.ok(serviceSrc.includes("sent/sending rows are never cancelled"));

// Draft → Start Sending preserved; no auto-send; save ≠ regenerate
assert.ok(panelSrc.includes("po-queue-start"));
assert.ok(panelSrc.includes("PROSPECT_CAMPAIGN_CONTROL_LABELS.startSending"));
assert.ok(!panelSrc.includes("auto-send"));
assert.ok(!panelSrc.includes("autoSend"));
assert.ok(dialogSrc.includes("method: \"PATCH\""));
assert.ok(dialogSrc.includes("/regenerate"));
assert.ok(
  !/updateQueueItemDraft[\s\S]{0,200}rewriteQueuedOutreachDrafts/.test(serviceSrc),
  "Save draft must not rewrite via AI",
);

// Regenerating uses campaign instructions + existing personalized draft
assert.ok(rewriteSrc.includes("itemIds"));
assert.ok(rewriteSrc.includes("buildOutreachDraftRewriteUserPrompt"));
assert.ok(serviceSrc.includes("settings.outreachInstructions"));
assert.ok(serviceSrc.includes("regenerateQueueItemDrafts"));

// APIs
assert.ok(routesSrc.includes("/queue/bulk-remove"));
assert.ok(routesSrc.includes("/queue/bulk-regenerate"));
assert.ok(routesSrc.includes('"/api/growth-tools/prospect-outreach/queue/:itemId"'));
assert.ok(routesSrc.includes("/queue/:itemId/regenerate"));
assert.ok(serviceSrc.includes("getQueueItemDetail"));
assert.ok(serviceSrc.includes("updateQueueItemDraft"));
assert.ok(serviceSrc.includes("regenerateQueueItemDrafts"));
assert.ok(serviceSrc.includes("removeQueueItemsBulk"));

// Draft detail must not select non-existent contacts.publicWebsite
assert.ok(!serviceSrc.includes("contacts.publicWebsite"));
assert.ok(serviceSrc.includes("websiteUrlUsed"));
assert.ok(dialogSrc.includes("Unable to load this draft. Please try again."));
assert.ok(dialogSrc.includes("This draft could not be found."));
assert.ok(!dialogSrc.includes("Failed to load draft"));
assert.ok(routesSrc.includes("Unable to load this draft. Please try again."));
assert.ok(!dialogSrc.includes("127.0.0.1:7693"));
assert.ok(!serviceSrc.includes("127.0.0.1:7693"));
assert.ok(!routesSrc.includes("127.0.0.1:7693"));

assert.ok(panelSrc.includes("po-status-tabs"));
assert.ok(panelSrc.includes("formatDraftCampaignReadyCopy"));

console.log("prospect-campaign-draft-management.test.ts: ok");
