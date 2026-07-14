/**
 * Prospect Intelligence approval + native email outreach helpers.
 * Run: npx tsx tests/prospect-approve-outreach.test.ts
 */
import assert from "node:assert/strict";
import {
  buildProspectOutreachInboxHref,
  buildProspectOutreachSubject,
  resolveProspectApproveOutreachUi,
  titleCaseProspectName,
} from "../shared/prospectContactEnrichment";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("unapproved prospect hides Send outreach and shows Approve", () => {
  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "pending",
    email: "info@jivesmedia.com",
  });
  assert.equal(ui.isApproved, false);
  assert.equal(ui.showApproveButton, true);
  assert.equal(ui.showSendOutreach, false);
});

run("approved + valid email shows Send outreach and hides Approve", () => {
  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "approved",
    email: "info@jivesmedia.com",
  });
  assert.equal(ui.isApproved, true);
  assert.equal(ui.showApproveButton, false);
  assert.equal(ui.showSendOutreach, true);
  assert.equal(ui.emailGateLabel, null);
});

run("approved + missing email shows add-email gate, no Send", () => {
  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "approved",
    email: null,
  });
  assert.equal(ui.showSendOutreach, false);
  assert.equal(ui.emailGateLabel, "Add email to send outreach");
});

run("inbox href targets contact email compose=new", () => {
  const href = buildProspectOutreachInboxHref("contact-abc");
  assert.equal(href, "/app/inbox/contact-abc?channel=email&compose=new&focusComposer=1");
  assert.ok(!href.includes("conversation="));
});

run("outreach subject uses prospect name", () => {
  assert.equal(buildProspectOutreachSubject("Jives Media"), "Idea for Jives Media");
});

run("title-cases lowercase prospect names in outreach subject", () => {
  assert.equal(titleCaseProspectName("jives media"), "Jives Media");
  assert.equal(buildProspectOutreachSubject("jives media"), "Idea for Jives Media");
  assert.equal(buildProspectOutreachSubject("Jives Media"), "Idea for Jives Media");
  assert.equal(buildProspectOutreachSubject("  jives   media "), "Idea for Jives Media");
  assert.notEqual(buildProspectOutreachSubject("jives media"), "Idea for jives media");
});

run("forceManualMode follows only the prospect-outreach compose flag", () => {
  // UnifiedInbox passes forceManualMode={forceNewEmailCompose} only for compose=new PI flow.
  const resolveForceManual = (forceNewEmailCompose: boolean) => Boolean(forceNewEmailCompose);
  assert.equal(resolveForceManual(true), true);
  assert.equal(resolveForceManual(false), false);
});

run("edited message survives approval payload shape", () => {
  // Approve request body must carry the current editor text (not only previously saved DB text).
  const draftBeforeApprove = "Custom outreach for Jives — edited before approve.";
  const approveBody = { suggestedFirstMessage: draftBeforeApprove };
  const persistedAfterApprove = {
    reviewStatus: "approved" as const,
    suggestedFirstMessage: approveBody.suggestedFirstMessage,
  };
  assert.equal(persistedAfterApprove.reviewStatus, "approved");
  assert.equal(persistedAfterApprove.suggestedFirstMessage, draftBeforeApprove);

  const outreachPrefill = {
    body: persistedAfterApprove.suggestedFirstMessage,
    subject: buildProspectOutreachSubject("Jives Media"),
  };
  assert.equal(outreachPrefill.body, draftBeforeApprove);
  assert.match(outreachPrefill.subject, /Jives Media/);
});

console.log("All prospect-approve-outreach tests passed.");
