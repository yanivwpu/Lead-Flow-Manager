/**
 * Copilot current-message intent + system Email guard.
 * Run: npx tsx tests/copilot-email-system-guard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasStrongRealEstateLeadEvidence,
  looksLikeSystemOrNotificationEmail,
  resolveAiConversationDomain,
  resolveAiDomainEligibility,
} from "../shared/aiDomainEligibility";
import { hasPropertyShowingIntent } from "../shared/conversationTextSignals";
import { hasStrongStructuredSearchSignals } from "../shared/buyerPreferenceInventorySignals";
import {
  buildContextualNextActions,
  buildContextualNextActionsDetailed,
} from "../shared/customerInsights";
import { shouldShowCopilotBuyerPreferences } from "../client/src/lib/copilotRgeVisibility";
import { scoreLead } from "../client/src/lib/leadScoring";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const RGE_WORKSPACE = {
  rgeInstalled: true,
  industry: "Real Estate",
} as const;

const CREDIT_NOTICE = `
Your credit usage went down this month.
Recent purchases and home for credit monitoring are listed below.
Visit examplebank.com to see available credit and cash back offers.
No action is required.
`;

const CREDIT_FROM = "alerts@notification.examplebank.com";
const CRM_BUYER_EMAIL = "jane.buyer@gmail.com";

const LINKEDIN_NOTICE = "Chinwendu just messaged you. View the conversation in your inbox.";
const ZILLOW_NOTICE =
  "New listing for rent near you. This is a listing alert. Manage your alerts in browser.";
const GOOGLE_TOS = `
  Google Terms of Service
  We've updated our Terms of Service and Privacy Policy.
  You can review the purchase terms in the agreement.
  Availability of services may vary by region.
`;
const HUMAN_BUYER = "I'm looking for a 2-bedroom condo in Pompano under $500k.";
const HUMAN_SHOWING = "Can we schedule a showing Saturday?";
const HUMAN_COMPANY = "Hi, can your team help us automate our customer support?";
const WEBSITE_PLANS = "Visit our website to see available plans";
const PRIOR_BUYER = "I'm looking to buy a 3-bedroom home in Boca under $800k.";

function copilot(input: {
  latest: string;
  history?: string;
  fromEmail?: string | null;
  contactEmail?: string | null;
  channel?: string | null;
  hasShowingIntent?: boolean;
}) {
  return buildContextualNextActions({
    inboundText: input.history
      ? `${input.history} ${input.latest}`
      : input.latest,
    latestInboundText: input.latest,
    conversationText: input.history ?? input.latest,
    fromEmail: input.fromEmail,
    contactEmail: input.contactEmail,
    channel: input.channel ?? "email",
    hasShowingIntent: input.hasShowingIntent,
    hasStrongPurchaseIntent: true,
    bucket: "cold",
    leadLabel: "Cold",
    ...RGE_WORKSPACE,
  });
}

function labelsOf(actions: ReturnType<typeof buildContextualNextActions>) {
  return actions.map((a) => a.label);
}

run("showing intent: real property asks", () => {
  assert.equal(hasPropertyShowingIntent("Can we schedule a showing Saturday?"), true);
  assert.equal(hasPropertyShowingIntent("Is the condo available?"), true);
  assert.equal(hasPropertyShowingIntent("Can I tour it tomorrow?"), true);
  assert.equal(hasPropertyShowingIntent("When can I visit the property?"), true);
});

run("showing intent: website / credit language is not a showing", () => {
  assert.equal(hasPropertyShowingIntent("Visit capitalone.com"), false);
  assert.equal(hasPropertyShowingIntent("Available credit"), false);
  assert.equal(hasPropertyShowingIntent("Visit our website"), false);
  assert.equal(hasPropertyShowingIntent("Product availability"), false);
  assert.equal(hasPropertyShowingIntent(WEBSITE_PLANS), false);
  assert.equal(hasPropertyShowingIntent(CREDIT_NOTICE), false);
});

run("structured search: real buyer vs purchase+home noise", () => {
  assert.equal(hasStrongStructuredSearchSignals(HUMAN_BUYER), true);
  assert.equal(hasStrongStructuredSearchSignals("I'm looking to buy a home in Pompano under $500k."), true);
  assert.equal(hasStrongStructuredSearchSignals("recent purchases"), false);
  assert.equal(hasStrongStructuredSearchSignals("helps you buy a home"), false);
  assert.equal(hasStrongStructuredSearchSignals("home for credit monitoring"), false);
  assert.equal(hasStrongRealEstateLeadEvidence("helps you buy a home"), false);
  assert.equal(hasStrongRealEstateLeadEvidence(CREDIT_NOTICE), false);
});

run("A. Credit-style notification Email — No action needed", () => {
  assert.equal(
    looksLikeSystemOrNotificationEmail({
      inboundText: CREDIT_NOTICE,
      fromEmail: CREDIT_FROM,
      contactEmail: CRM_BUYER_EMAIL,
      channel: "email",
    }),
    true,
  );
  const decision = resolveAiDomainEligibility({
    inboundText: CREDIT_NOTICE,
    conversationText: PRIOR_BUYER,
    fromEmail: CREDIT_FROM,
    contactEmail: CRM_BUYER_EMAIL,
    channel: "email",
    buyerProfileHasCriteria: true,
    leadType: "buyer",
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "system");
  assert.equal(decision.copilotNoActionNeeded, true);
  assert.equal(decision.showRealEstateCopilotRecommendations, false);

  const actions = copilot({
    latest: CREDIT_NOTICE,
    history: PRIOR_BUYER,
    fromEmail: CREDIT_FROM,
    contactEmail: CRM_BUYER_EMAIL,
    hasShowingIntent: true,
  });
  const labels = labelsOf(actions);
  assert.deepEqual(labels, ["No action needed"]);
  assert.equal(actions[0]?.behavior, "info");
  assert.ok(!labels.some((l) => /showing|listings|nurture|assign agent/i.test(l)));

  const detailed = buildContextualNextActionsDetailed({
    inboundText: `${PRIOR_BUYER} ${CREDIT_NOTICE}`,
    latestInboundText: CREDIT_NOTICE,
    conversationText: PRIOR_BUYER,
    fromEmail: CREDIT_FROM,
    contactEmail: CRM_BUYER_EMAIL,
    channel: "email",
    hasShowingIntent: true,
    ...RGE_WORKSPACE,
  });
  assert.equal(detailed.actions[0]?.provenance?.source, "system_notification_guard");

  assert.equal(
    shouldShowCopilotBuyerPreferences({
      inboundText: CREDIT_NOTICE,
      conversationText: PRIOR_BUYER,
      fromEmail: CREDIT_FROM,
      contactEmail: CRM_BUYER_EMAIL,
      channel: "email",
      industry: "Real Estate",
      inventoryStatus: { canUse: true, rgeInstalled: true } as any,
      customFields: { leadType: "buyer" },
    }),
    false,
  );

  const scored = scoreLead(
    [{ direction: "inbound", content: CREDIT_NOTICE }],
    { industry: "real_estate" },
    { isRealEstate: true, fromEmail: CREDIT_FROM, channel: "email" },
  );
  assert.ok(
    !scored.signals.detected.some((d) => d === "re:viewing" || d === "re:financing"),
    `unexpected RE tokens: ${scored.signals.detected.join(",")}`,
  );
  assert.ok(!scored.signals.detected.some((d) => d.includes("availability")));
  assert.equal(scored.signals.industry, null);
});

run("A. message From is used (CRM contact email is not enough to skip system)", () => {
  assert.equal(
    looksLikeSystemOrNotificationEmail({
      inboundText: CREDIT_NOTICE,
      contactEmail: CRM_BUYER_EMAIL,
      fromEmail: CREDIT_FROM,
      channel: "email",
    }),
    true,
  );
  const domain = resolveAiConversationDomain({
    inboundText: CREDIT_NOTICE,
    fromEmail: CREDIT_FROM,
    contactEmail: CRM_BUYER_EMAIL,
    channel: "email",
    ...RGE_WORKSPACE,
  });
  assert.equal(domain, "system");
});

run("A. current inbound dominates stale buyer history", () => {
  const domain = resolveAiConversationDomain({
    inboundText: CREDIT_NOTICE,
    conversationText: PRIOR_BUYER,
    fromEmail: CREDIT_FROM,
    channel: "email",
    buyerProfileHasCriteria: true,
    leadType: "buyer",
    ...RGE_WORKSPACE,
  });
  assert.equal(domain, "system");
});

run("B. Platform notification Email — No action needed", () => {
  const actions = copilot({
    latest: LINKEDIN_NOTICE,
    fromEmail: "notifications@mail.example-network.com",
  });
  assert.deepEqual(labelsOf(actions), ["No action needed"]);
  assert.equal(actions[0]?.behavior, "info");
  assert.equal(
    resolveAiConversationDomain({
      inboundText: LINKEDIN_NOTICE,
      channel: "email",
      ...RGE_WORKSPACE,
    }),
    "system",
  );
});

run("C. Automated listing notification is not a buyer asking for listings", () => {
  const actions = copilot({
    latest: ZILLOW_NOTICE,
    fromEmail: "alerts@updates.example-listings.com",
  });
  const labels = labelsOf(actions);
  assert.deepEqual(labels, ["No action needed"]);
  assert.ok(!labels.some((l) => /matching listings|showing/i.test(l)));
  assert.equal(
    resolveAiConversationDomain({
      inboundText: ZILLOW_NOTICE,
      channel: "email",
      ...RGE_WORKSPACE,
    }),
    "system",
  );
});

run("D. Google noreply regression", () => {
  const actions = copilot({
    latest: GOOGLE_TOS,
    fromEmail: "google-noreply@google.com",
    contactEmail: "google-noreply@google.com",
  });
  assert.deepEqual(labelsOf(actions), ["No action needed"]);
  assert.equal(actions[0]?.behavior, "info");
});

run("E. Human buyer Email remains actionable", () => {
  const decision = resolveAiDomainEligibility({
    inboundText: HUMAN_BUYER,
    fromEmail: "alex@client.com",
    channel: "email",
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "real_estate_buyer");
  assert.equal(decision.copilotNoActionNeeded, false);
  const labels = labelsOf(
    copilot({ latest: HUMAN_BUYER, fromEmail: "alex@client.com" }),
  );
  assert.ok(labels.some((l) => /share matching listings/i.test(l)));
  assert.ok(!labels.some((l) => /no action needed/i.test(l)));
});

run("F. Human showing Email — Confirm showing availability", () => {
  const labels = labelsOf(
    copilot({ latest: HUMAN_SHOWING, fromEmail: "alex@client.com" }),
  );
  assert.ok(labels.some((l) => /confirm showing availability/i.test(l)));
  assert.ok(!labels.some((l) => /no action needed/i.test(l)));
});

run("G. Human company inquiry is not system/no-action", () => {
  const decision = resolveAiDomainEligibility({
    inboundText: HUMAN_COMPANY,
    fromEmail: "ops@acme.com",
    channel: "email",
    ...RGE_WORKSPACE,
  });
  assert.notEqual(decision.domain, "system");
  assert.equal(decision.copilotNoActionNeeded, false);
  const labels = labelsOf(
    copilot({ latest: HUMAN_COMPANY, fromEmail: "ops@acme.com" }),
  );
  assert.ok(!labels.some((l) => /no action needed/i.test(l)));
  assert.ok(!labels.some((l) => /matching listings|showing/i.test(l)));
});

run("H. Website language is not showing intent", () => {
  assert.equal(hasPropertyShowingIntent(WEBSITE_PLANS), false);
  const labels = labelsOf(
    copilot({ latest: WEBSITE_PLANS, fromEmail: "hello@acme.com" }),
  );
  assert.ok(!labels.some((l) => /confirm showing availability/i.test(l)));
});

run("WhatsApp human buyer is unchanged", () => {
  const labels = labelsOf(
    copilot({
      latest: HUMAN_BUYER,
      fromEmail: null,
      channel: "whatsapp",
    }),
  );
  assert.ok(labels.some((l) => /share matching listings/i.test(l)));
});

run("buyerPreferenceService skips system/notification inbound", () => {
  const svc = readFileSync(
    join(import.meta.dirname, "..", "server/buyerPreferenceService.ts"),
    "utf8",
  );
  assert.ok(svc.includes("looksLikeSystemOrNotificationEmail"));
  assert.ok(svc.includes("system_or_notification_email"));
  assert.equal(
    looksLikeSystemOrNotificationEmail({ inboundText: CREDIT_NOTICE, channel: "email" }),
    true,
  );
  assert.equal(hasStrongStructuredSearchSignals(CREDIT_NOTICE), false);
});

run("UnifiedInbox passes message From into Copilot", () => {
  const inbox = readFileSync(
    join(import.meta.dirname, "..", "client/src/pages/UnifiedInbox.tsx"),
    "utf8",
  );
  assert.ok(inbox.includes("fromAddress: m.fromAddress"));
  const panel = readFileSync(
    join(import.meta.dirname, "..", "client/src/components/InboxLeadDetailsPanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("fromEmail: lastInboundFromAddress"));
  assert.ok(panel.includes("latestInboundText: currentInbound"));
});

console.log("copilot-email-system-guard.test.ts: all assertions passed");
