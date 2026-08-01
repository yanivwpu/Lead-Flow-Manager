/**
 * Send to Campaign confirmation copy — dynamic eligible count + no-immediate-send wording.
 * Run: npx tsx tests/prospect-send-campaign-confirm-copy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSendToCampaignConfirmCopy } from "../shared/prospectBulkOutreach";

{
  const one = formatSendToCampaignConfirmCopy(1);
  assert.match(one, /this 1 prospect/);
  assert.doesNotMatch(one, /prospects/);
  assert.match(one, /personalized email subject and message will be saved/);
  assert.match(one, /moved to the Campaigns tab/);
  assert.match(one, /review, edit, and start sending/);
}

{
  const many = formatSendToCampaignConfirmCopy(44);
  assert.match(many, /these 44 prospects/);
  assert.doesNotMatch(many, /this 44/);
  assert.match(many, /personalized email subject and message will be saved/);
  assert.match(many, /Campaigns tab/);
  assert.match(many, /start sending/);
}

{
  assert.match(formatSendToCampaignConfirmCopy(0), /these 0 prospects/);
  assert.match(formatSendToCampaignConfirmCopy(2), /these 2 prospects/);
}

{
  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("formatSendToCampaignConfirmCopy"));
  assert.ok(panel.includes('data-testid="pi-send-campaign-confirm-copy"'));
  assert.ok(panel.includes("formatSendToCampaignConfirmCopy(queuePreview.willQueue)"));
  assert.ok(!panel.includes("The current email subject and message will be saved for these prospects."));
}

console.log("prospect-send-campaign-confirm-copy.test.ts: all assertions passed");
