import assert from "node:assert/strict";
import { channelService } from "../server/channelService";
import { scheduleW2FollowUpTimers } from "../server/automationTimerHandlers";
import { storage } from "../server/storage";

const user = await storage.createUser({
  email: `inbound-contract-${Date.now()}@test.com`,
  password: "test123",
  name: "Inbound Contract Test",
});

const requiredKeys = [
  "success",
  "contact",
  "conversation",
  "message",
  "workflowState",
  "chatbotState",
  "automationState",
  "created",
  "updated",
  "deduped",
  "channel",
  "sourceEventId",
] as const;

function assertNormalizedResult(result: Awaited<ReturnType<typeof channelService.processIncomingMessage>>) {
  for (const key of requiredKeys) {
    assert.ok(key in result, `result must include ${key}`);
  }
  assert.equal(result.success, true);
  assert.ok(result.contact, "result.contact must be populated");
  assert.ok(result.conversation, "result.conversation must be populated");
  assert.ok(result.message, "result.message must be populated");
  assert.ok(result.workflowState.status, "workflowState.status must be populated");
  assert.ok(result.chatbotState.status, "chatbotState.status must be populated");
  assert.equal(typeof result.chatbotState.willFire, "boolean");
  assert.ok(result.automationState.status, "automationState.status must be populated");
  assert.equal(typeof result.created.contact, "boolean");
  assert.equal(typeof result.created.conversation, "boolean");
  assert.equal(typeof result.created.message, "boolean");
  assert.equal(typeof result.updated.contact, "boolean");
  assert.equal(typeof result.updated.conversation, "boolean");
  assert.equal(typeof result.updated.message, "boolean");
}

const first = await channelService.processIncomingMessage({
  userId: user.id,
  channel: "whatsapp",
  channelContactId: "+15551230001",
  contactName: "Workflow Lead",
  content: "Hi, I want to buy a house",
  contentType: "text",
  externalMessageId: `inbound_contract_whatsapp_${Date.now()}`,
});
assertNormalizedResult(first);
assert.equal(first.workflowState.status, "processed", "inbound message should expose workflow state");
assert.equal(first.automationState.status, "processed", "inbound message should expose automation state");

const second = await channelService.processIncomingMessage({
  userId: user.id,
  channel: "whatsapp",
  channelContactId: "+15551230001",
  contactName: "Workflow Lead",
  content: "My budget is around 750k",
  contentType: "text",
  externalMessageId: `inbound_contract_whatsapp_followup_${Date.now()}`,
});
assertNormalizedResult(second);
assert.equal(second.contact?.id, first.contact?.id, "follow-up inbound should attach to existing contact");
assert.equal(second.conversation?.id, first.conversation?.id, "follow-up inbound should attach to existing conversation");
assert.equal(second.created.conversation, false, "follow-up inbound should not create a duplicate conversation");

const deduped = await channelService.processIncomingMessage({
  userId: user.id,
  channel: "whatsapp",
  channelContactId: "+15551230001",
  contactName: "Workflow Lead",
  content: "Duplicate delivery",
  contentType: "text",
  externalMessageId: first.sourceEventId || "missing_source_event_id",
});
assert.equal(deduped.success, true);
assert.equal(deduped.deduped, true);
assert.equal(deduped.contact?.id, first.contact?.id, "dedupe should preserve contact state");
assert.equal(deduped.conversation?.id, first.conversation?.id, "dedupe should preserve conversation state");
assert.equal(deduped.message?.id, first.message?.id, "dedupe should return the original message");

for (const channel of ["facebook", "instagram", "webchat"] as const) {
  const result = await channelService.processIncomingMessage({
    userId: user.id,
    channel,
    channelContactId: `${channel}_contract_sender_${Date.now()}`,
    contactName: `${channel} Contract Lead`,
    content: `Hello from ${channel}`,
    contentType: "text",
    externalMessageId: `inbound_contract_${channel}_${Date.now()}`,
  });
  assertNormalizedResult(result);
  assert.equal(result.channel, channel);
}

const calendlyContact = await storage.createContact({
  userId: user.id,
  name: "Calendly Existing Lead",
  email: "calendly-existing@example.com",
  primaryChannel: "whatsapp",
  source: "whatsapp",
});
const calendly = await channelService.processIncomingMessage({
  userId: user.id,
  channel: "calendly",
  channelContactId: "calendly-existing@example.com",
  contactName: "Calendly Existing Lead",
  content: "Booking created",
  contentType: "calendly_event",
  externalMessageId: `inbound_contract_calendly_${Date.now()}`,
  preferredContactId: calendlyContact.id,
});
assertNormalizedResult(calendly);
assert.equal(calendly.contact?.id, calendlyContact.id, "Calendly inbound event should preserve existing contact linkage");

const originalCreateAutomationTimerJob = storage.createAutomationTimerJob.bind(storage);
let w2TimerCreated = false;
(storage as any).createAutomationTimerJob = async (job: any) => {
  w2TimerCreated = true;
  return { ...job, id: `inbound_contract_timer_${Date.now()}`, createdAt: new Date() };
};
try {
  await scheduleW2FollowUpTimers({
    userId: user.id,
    contactId: first.contact!.id,
    qualificationText: "Are you pre-approved?",
    routingText: null,
    snapshotInboundAt: first.contact!.lastIncomingAt,
  });
  assert.equal(w2TimerCreated, true, "normalized inbound contact state should allow W2 follow-up scheduling");
} finally {
  (storage as any).createAutomationTimerJob = originalCreateAutomationTimerJob;
}

console.log("PASS inbound processing returns a normalized state contract for all launch channels.");
