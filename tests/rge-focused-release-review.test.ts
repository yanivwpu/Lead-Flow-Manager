import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BuyerPreferencesPanel } from "../client/src/components/BuyerPreferencesPanel";
import { storage } from "../server/storage";
import { db } from "../drizzle/db";
import { channelService } from "../server/channelService";
import { subscriptionService } from "../server/subscriptionService";
import { applyManualBuyerPreferencePatch, mergeAndPersistBuyerPreferences } from "../server/buyerPreferenceService";
import { executeWorkflowActions } from "../server/workflowEngine";
import { processAutomationTimerJob, scheduleW2FollowUpTimers } from "../server/automationTimerHandlers";
import { isInventoryContactEligible, isRgeContactEligible, requiresRgeContactIntent, requiresBuyerPropertyIntent } from "../server/inventory/inventoryContactEligibility";
import { getSavedListingIdsForContact, saveListingMatchForContact } from "../server/inventory/inventorySavedMatchService";
import { generateInventoryMatchDraft } from "../server/inventory/inventoryDraftService";
import { hasVerifiedContactEligibilityResponse } from "../shared/inventoryContactEligibility";

let profile: any = {schemaVersion: 1, profileStatus: "partial", bedsMin: {value: 11, confidence: .9, source: "inferred", updatedAt: "2026-01-01"}};
const contact = () => ({id: "contact", userId: "tenant", buyerPreferenceProfile: profile, customFields: {leadType: "buyer"}}) as any;
let history = ["I need a car rental in Pompano under $500"];
let oldPage: string[] = [];
let offsets: number[] = [];
const originals = {incrementWorkflowExecution: storage.incrementWorkflowExecution, getUserForSession: storage.getUserForSession, getContact: storage.getContact, getContactWithConversations: storage.getContactWithConversations, getMessages: storage.getMessages,
  updateContactBuyerPreferenceProfile: storage.updateContactBuyerPreferenceProfile, getTemplateInstall: storage.getTemplateInstall,
  logWorkflowExecution: storage.logWorkflowExecution, createAutomationTimerJob: storage.createAutomationTimerJob,
  cancelPendingAutomationTimerJobsForUserContactKinds: storage.cancelPendingAutomationTimerJobsForUserContactKinds,
  markAutomationTimerJobSkipped: storage.markAutomationTimerJobSkipped};
const originalActivity = channelService.logActivity;
const originalLimits = subscriptionService.getUserLimits;
const originalQuery = db.$client.query;
let sqlCalls = 0;
(db.$client as any).query = () => {sqlCalls++; throw new Error("Unexpected DB read/write");};
(globalThis as any).React = React;
(storage as any).getUserForSession = async () => ({id: "tenant", subscriptionPlan: "pro"});
(storage as any).getContact = async () => contact();
(storage as any).getContactWithConversations = async () => ({contact: contact(), conversations: [{id: "thread", userId: "tenant"}]});
(storage as any).getMessages = async (_id: string, _limit: number, offset: number = 0) => {offsets.push(offset); return (offset === 0 ? history : oldPage).map(content => ({direction: "inbound", content}));};
(storage as any).getTemplateInstall = async () => ({installStatus: "installed"});
(storage as any).updateContactBuyerPreferenceProfile = async (_id: string, next: any, opts: any) => {assert.equal(opts.expectedWorkspaceUserId, "tenant"); profile = next; return contact();};
(channelService as any).logActivity = async () => {};
(subscriptionService as any).getUserLimits = async () => ({plan: "pro", hasAIBrainAddon: true, paidAutomationEnabled: true, workflowsEnabled: true, followUpsEnabled: true, chatbotEnabled: true});
(storage as any).logWorkflowExecution = async () => {};
(storage as any).incrementWorkflowExecution = async () => {};
process.env.INVENTORY_CONNECTOR_ENABLED = "true";
try {
  // Existing records and old broad API caches confer no eligibility.
  assert.equal(hasVerifiedContactEligibilityResponse({eligible: true}), false);
  assert.equal(hasVerifiedContactEligibilityResponse({eligible: false, eligibilityVersion: 2}), false);
  assert.deepEqual(await getSavedListingIdsForContact("contact", "tenant"), []);
  assert.equal((await saveListingMatchForContact("contact", "tenant", {listingId: "old-match", score: 100, reasons: []})).ok, false);
  assert.equal((await generateInventoryMatchDraft("contact", "old-match", "tenant") as any).httpStatus, 403);

  // Established buyers need neither the new confirmation field nor message references.
  for (const latest of ["Hi!", "Thanks, talk tomorrow", "How is the weather?", "I took my car for maintenance today", "Does WhachatCRM integrate with GHL?"]) {
    history = ["I'm looking to buy a condo in Pompano under $500k", latest];
    assert.equal(await isInventoryContactEligible(contact()), true, latest);
    assert.equal(profile.agentConfirmedAt, undefined);
  }
  history = Array(100).fill("Hi, how are you?");
  oldPage = ["I'm looking to buy a condo in Pompano under $500k"];
  offsets = [];
  assert.equal(await isInventoryContactEligible(contact()), true, "legacy intent beyond first 100 messages");
  assert.deepEqual(offsets, [0, 100]);
  history = ["I want to sell my house"];
  oldPage = [];
  assert.equal(await isRgeContactEligible(contact()), true);
  assert.equal(await isInventoryContactEligible(contact()), false);
  assert.equal((await executeWorkflowActions({id: "seller-nurture", userId: "tenant", actions: [], triggerConditions: {templateId: "realtor-growth-engine", templateKey: "W4"}} as any, null, {}, contact())).success, true, "seller nurture is preserved");
  history = ["Please connect me with a mortgage lender"];
  assert.equal(await isRgeContactEligible(contact()), true);
  assert.equal(await isInventoryContactEligible(contact()), false);

  // Only automatic RGE lead enrollment/nurture is guarded; safety/language/booking/custom workflows keep their scope.
  const workflow = (key: string, actions: any[] = []) => ({id: "workflow", userId: "tenant", actions, triggerConditions: {templateId: "realtor-growth-engine", templateKey: key}}) as any;
  for (const key of ["W1", "W4", "W5", "W6"]) assert.equal(requiresRgeContactIntent(workflow(key)), true);
  for (const key of ["W3", "W7", "W8", "custom-referral", "custom-booking"]) assert.equal(requiresRgeContactIntent(workflow(key)), false);
  assert.equal(requiresRgeContactIntent({triggerConditions: {templateId: "another-engine", templateKey: "W1"}}), false);
  const propertyWorkflow = workflow("custom", [{type: "send_message_template", templateKey: "re_engagement"}]);
  assert.equal(requiresBuyerPropertyIntent(propertyWorkflow), true);
  assert.equal(requiresBuyerPropertyIntent({...propertyWorkflow, triggerConditions: {templateId: "another-engine"}}), false, "same template name in non-property engine is unchanged");
  assert.equal((await executeWorkflowActions(propertyWorkflow, null, {}, contact())).blockedReason, "contact_intent_ineligible", "referral does not authorize property outreach");
  history = ["I need a car rental in Pompano under $500"];
  for (const key of ["W3", "W7", "W8", "custom-referral", "custom-booking"]) {
    assert.equal((await executeWorkflowActions(workflow(key), null, {}, contact())).success, true, key);
  }

  // Delayed property qualification rechecks current data even with an eligible snapshot.
  const staleEligibleContact = {...contact(), buyerPreferenceProfile: {...profile, agentConfirmedAt: "2026-01-01"}};
  assert.equal((await executeWorkflowActions(workflow("W4"), null, {}, staleEligibleContact)).blockedReason, "contact_intent_ineligible");
  let skipped = "";
  (storage as any).markAutomationTimerJobSkipped = async (_id: string, reason: string) => {skipped = reason;};
  await processAutomationTimerJob({id: "queued-property", userId: "tenant", kind: "w2_qualification", payload: {userId: "tenant", contactId: "contact", text: "Should never send"}} as any);
  assert.equal(skipped, "contact_intent_ineligible");
  const queued: any[] = [];
  (storage as any).cancelPendingAutomationTimerJobsForUserContactKinds = async () => {};
  (storage as any).createAutomationTimerJob = async (job: any) => {queued.push(job); return job;};
  await scheduleW2FollowUpTimers({userId: "tenant", contactId: "contact", qualificationText: "property qualification", routingText: "agent-configured referral", snapshotInboundAt: null});
  assert.deepEqual(queued.map(job => job.kind), ["w2_routing"], "referral routing is independent of property matching");

  // Explicit confirmation is usable from the existing editor and cannot be stamped by automatic merges.
  const client = new QueryClient({defaultOptions: {queries: {queryFn: async () => ({})}}});
  client.setQueryData(["/api/contacts/contact/buyer-preferences"], {eligible: false, eligibilityVersion: 2, profile});
  const markup = renderToStaticMarkup(React.createElement(QueryClientProvider, {client}, React.createElement(BuyerPreferencesPanel, {contactId: "contact", compact: true, manualSetupOnly: true})));
  assert.match(markup, /button-setup-property-matching/);
  assert.doesNotMatch(markup, /buyer-preferences-chips/);
  client.clear();
  await mergeAndPersistBuyerPreferences(contact(), {bedsMin: {...profile.bedsMin, value: 3}}, {triggerInventoryRefresh: false});
  assert.equal(profile.agentConfirmedAt, undefined);
  const confirmed = await applyManualBuyerPreferencePatch("tenant", "contact", {});
  assert.ok(confirmed?.agentConfirmedAt, "explicit save can confirm with no criteria yet");
  assert.equal(await isInventoryContactEligible(contact()), true);
  assert.equal(await applyManualBuyerPreferencePatch("foreign-tenant", "contact", {}), null);
  assert.equal(sqlCalls, 0, "all tests use controlled stubs; no real DB access or sends");
  console.log("PASS focused release review: confirmation UI/writer, legacy continuity, workflow scope, delayed recheck, stored-match denial, old-cache denial");
} finally {
  Object.assign(storage, originals);
  channelService.logActivity = originalActivity;
  subscriptionService.getUserLimits = originalLimits;
  db.$client.query = originalQuery;
}
