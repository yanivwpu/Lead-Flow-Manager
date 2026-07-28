/**
 * Outreach recipient greeting — never greet workspace owner / business name.
 * Run: npx tsx tests/prospect-outreach-greeting.test.ts
 */
import assert from "node:assert/strict";
import {
  applyOutreachMessageGuardrails,
  applyRecipientGreetingGuard,
  buildNeutralFirstMessage,
  buildTailoredFirstMessage,
  resolveOutreachRecipientFirstName,
} from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectIntelligence } from "@shared/prospectImport";

const workspaceOwner = {
  configured: true as const,
  displayName: "Yaniv",
  businessName: "WhachatCRM",
  aiBrainIsPrimary: true,
  servicesProducts: "AI CRM and unified inbox",
  executiveSummary: "AI CRM for customer conversations",
};

// Verified contact person name exists
{
  const first = resolveOutreachRecipientFirstName(
    { name: "Sarah Chen", company: "Chen Realty" },
    workspaceOwner,
  );
  assert.equal(first, "Sarah");
  const msg = buildTailoredFirstMessage(
    { name: "Sarah Chen", company: "Chen Realty", originalTags: [] },
    { recommendedOffer: "general_demo", potentialFit: "medium" },
    workspaceOwner,
  );
  assert.match(msg, /^Hi Sarah,/);
  assert.doesNotMatch(msg, /Hi Yaniv/i);
}

// Business only (Places-style name === company)
{
  const first = resolveOutreachRecipientFirstName(
    { name: "Real Brokers Miami", company: "Real Brokers Miami" },
    workspaceOwner,
  );
  assert.equal(first, "there");
  const msg = buildNeutralFirstMessage(
    { name: "Real Brokers Miami", company: "Real Brokers Miami", originalTags: [] },
    workspaceOwner,
  );
  assert.match(msg, /^Hi there,/);
  assert.doesNotMatch(msg, /Hi Real\b/i);
  assert.doesNotMatch(msg, /Hi Yaniv/i);
}

// Workspace owner exists but prospect name missing / unknown
{
  const first = resolveOutreachRecipientFirstName(
    { name: "Unknown", company: "Real Brokers Miami" },
    workspaceOwner,
  );
  assert.equal(first, "there");
}

// Sender name differs from recipient — never greet sender
{
  const guarded = applyRecipientGreetingGuard(
    "Hi Yaniv, I'm reaching out about your brokerage.",
    { name: "Real Brokers Miami", company: "Real Brokers Miami", originalTags: [] },
    workspaceOwner,
  );
  assert.match(guarded, /^Hi there,/);
  assert.doesNotMatch(guarded, /Hi Yaniv/i);
}

// AI draft that greets workspace owner is rewritten
{
  const result: ProspectIntelligence = {
    needsReview: false,
    potentialFit: "medium",
    priority: "medium",
    recommendedOffer: "general_demo",
    leadScore: 60,
    confidence: 60,
    suggestedFirstMessage: "Hi Yaniv, we help brokerages manage conversations.",
  };
  const out = applyOutreachMessageGuardrails(
    result,
    { name: "Real Brokers Miami", company: "Real Brokers Miami", originalTags: [] },
    workspaceOwner,
  );
  assert.doesNotMatch(out.suggestedFirstMessage || "", /Hi Yaniv/i);
  assert.match(out.suggestedFirstMessage || "", /Hi there,/i);
}

// Person name that happens to match sender first name → neutral (do not greet sender)
{
  const first = resolveOutreachRecipientFirstName(
    { name: "Yaniv", company: "Other Co" },
    workspaceOwner,
  );
  assert.equal(first, "there");
}

console.log("prospect-outreach-greeting.test.ts: all assertions passed");
