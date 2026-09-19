import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTACT_LIFECYCLE_PROSPECT_ONLY,
  isCrmListedContact,
  isInboxListedContact,
  isProspectOnlyContact,
  prospectOnlySourceDetails,
  savedContactSourceDetails,
  shouldPromoteProspectOnlyIdentity,
} from "../shared/contactCrmVisibility";
import { buildInboxItemsForContact } from "../shared/inboxRowModel";

const prospect = {
  id: "prospect-1",
  source: "import",
  primaryChannel: "email",
  sourceDetails: prospectOnlySourceDetails(undefined, {
    prospectAi: { discoveryResultId: "result-1" },
  }),
};

assert.equal(isProspectOnlyContact(prospect), true);
assert.equal(isCrmListedContact(prospect), false, "review identity must not be a normal Contact");
assert.equal(isInboxListedContact(prospect), false, "review identity must not create an Inbox row");
for (const channel of [
  "whatsapp",
  "sms",
  "email",
  "facebook",
  "instagram",
  "telegram",
  "webchat",
] as const) {
  assert.equal(
    shouldPromoteProspectOnlyIdentity({ contact: prospect, direction: "inbound" }),
    true,
    `${channel} inbound must cross the common promotion boundary`,
  );
}
assert.equal(
  shouldPromoteProspectOnlyIdentity({ contact: prospect, direction: "outbound" }),
  false,
  "outbound messages must never promote a prospect identity",
);
assert.equal(
  buildInboxItemsForContact({ contact: prospect, conversations: [] }).length,
  1,
  "row builder remains generic; storage must exclude prospect-only identities before expansion",
);

const outboundConversation = {
  id: "thread-1",
  channel: "email",
  lastMessageDirection: "outbound",
  lastMessagePreview: "Hello",
};
assert.equal(
  buildInboxItemsForContact({
    contact: prospect,
    conversations: [outboundConversation],
    hiddenColdOutreachConversationIds: new Set(["thread-1"]),
  }).length,
  0,
  "outbound-only cold outreach must not create a visible Inbox row",
);

const promoted = {
  ...prospect,
  sourceDetails: savedContactSourceDetails(prospect.sourceDetails, {
    promotedFromInboxIdentity: true,
  }),
};
assert.equal(isCrmListedContact(promoted), true, "first inbound reply promotes the same identity");
assert.equal(isInboxListedContact(promoted), true, "promoted reply is exposed in Inbox");
assert.equal(promoted.id, prospect.id, "promotion is idempotent and must not create a duplicate");
assert.deepEqual(
  (promoted.sourceDetails as any).prospectAi,
  (prospect.sourceDetails as any).prospectAi,
  "promotion preserves Prospect AI attribution",
);
assert.notEqual(
  (promoted.sourceDetails as any).contactLifecycle,
  CONTACT_LIFECYCLE_PROSPECT_ONLY,
);

const discoverySource = readFileSync("server/prospectAI/prospectAIService.ts", "utf8");
assert.match(discoverySource, /sourceDetails: prospectOnlySourceDetails/);
assert.doesNotMatch(discoverySource, /createConversation\s*\(/);
const inboxSource = readFileSync("server/storage.ts", "utf8");
assert.match(inboxSource, /isInboxListedContact\(c\)/);
const emailMatchSource = readFileSync("server/emailChannel/contactMatch.ts", "utf8");
assert.match(emailMatchSource, /shouldPromoteProspectOnlyIdentity\(\{ contact, direction: params\.direction \}\)/);
const channelServiceSource = readFileSync("server/channelService.ts", "utf8");
assert.match(channelServiceSource, /shouldPromoteProspectOnlyIdentity\(\{ contact, direction: "inbound" \}\)/);

// Every non-email supported entry point delegates to the common inbound service.
const webhookSource = readFileSync("server/routes/webhooks.ts", "utf8");
for (const channel of ["telegram", "webchat"] as const) {
  assert.match(webhookSource, new RegExp(`channel: ["']${channel}["'][\\s\\S]{0,500}processIncomingMessage|processIncomingMessage\\([\\s\\S]{0,200}channel: ["']${channel}["']`));
}
assert.match(webhookSource, /channel: channel as any/); // Twilio selects WhatsApp or SMS.
const legacyWebhookSource = readFileSync("server/routes.ts", "utf8");
for (const channel of ["whatsapp", "facebook", "instagram"] as const) {
  assert.match(legacyWebhookSource, new RegExp(`processIncomingMessage\\([\\s\\S]{0,250}channel: ["']${channel}["']`));
}
const instagramPollingSource = readFileSync("server/instagramPolling.ts", "utf8");
assert.match(instagramPollingSource, /processIncomingMessage\([\s\S]{0,250}channel: "instagram"/);
const auditSource = readFileSync("scripts/audit-prospect-ai-contact-shells.ts", "utf8");
assert.match(auditSource, /BEGIN READ ONLY/);
assert.match(auditSource, /await client\.query\("ROLLBACK"\)/);

console.log("prospect-ai-crm-lifecycle.test.ts: all assertions passed");
