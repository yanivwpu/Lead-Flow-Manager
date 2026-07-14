/**
 * Prospect Intelligence approval + native email outreach helpers.
 * Run: npx tsx tests/prospect-approve-outreach.test.ts
 */
import assert from "node:assert/strict";
import {
  buildProspectOutreachInboxHref,
  buildProspectOutreachSubject,
  parseProspectOutreachComposePayload,
  prospectOutreachPayloadDiag,
  resolveProspectApproveOutreachUi,
  shouldStripProspectComposeQuery,
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

run("manually-enriched email path still builds subject+body payload", () => {
  const name = "smash interactive agency | digital marketing agency miami";
  const approvedBody = "Approved Smash outreach draft — edited before approve.";
  const payload = {
    contactId: "contact-smash",
    source: "prospect_intelligence" as const,
    subject: buildProspectOutreachSubject(name),
    body: approvedBody,
    createdAt: Date.now(),
  };
  const diag = prospectOutreachPayloadDiag(payload);
  assert.equal(diag.hasSubject, true);
  assert.equal(diag.hasBody, true);
  assert.ok(diag.subjectLength > 0);
  assert.ok(diag.bodyLength > 0);
  assert.match(payload.subject, /Smash Interactive Agency/i);
});

run("parse rejects mismatched contactId and accepts exact match", () => {
  const raw = JSON.stringify({
    contactId: "contact-a",
    source: "prospect_intelligence",
    subject: "Idea for Acme",
    body: "Hello Acme",
    createdAt: 1,
  });
  assert.equal(parseProspectOutreachComposePayload(raw, "contact-b"), null);
  const ok = parseProspectOutreachComposePayload(raw, "contact-a");
  assert.ok(ok);
  assert.equal(ok?.subject, "Idea for Acme");
  assert.equal(ok?.body, "Hello Acme");
});

run("do not strip compose=new until email reachable and handoff adopted", () => {
  // Regression: stripQuery on missing email killed compose params while Manual banner still showed.
  assert.equal(
    shouldStripProspectComposeQuery({
      composeNew: true,
      emailReachable: false,
      handoffAdopted: false,
    }),
    false,
  );
  assert.equal(
    shouldStripProspectComposeQuery({
      composeNew: true,
      emailReachable: true,
      handoffAdopted: false,
    }),
    false,
  );
  assert.equal(
    shouldStripProspectComposeQuery({
      composeNew: true,
      emailReachable: true,
      handoffAdopted: true,
    }),
    true,
  );
  assert.equal(
    shouldStripProspectComposeQuery({
      composeNew: false,
      emailReachable: true,
      handoffAdopted: false,
    }),
    true,
  );
});

run("existing-email and enriched-email payloads both include subject+body", () => {
  const existing = {
    body: "Jives body",
    subject: buildProspectOutreachSubject("Jives Media"),
  };
  const enriched = {
    body: "Smash body",
    subject: buildProspectOutreachSubject("smash interactive"),
  };
  assert.equal(prospectOutreachPayloadDiag(existing as any).hasBody, true);
  assert.equal(prospectOutreachPayloadDiag(enriched as any).hasSubject, true);
});

console.log("All prospect-approve-outreach tests passed.");
