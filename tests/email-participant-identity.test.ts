/**
 * Gmail participant identity: direction, From/To names, Inbox title.
 * Run: npx tsx --test tests/email-participant-identity.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { normalizeGmailApiMessage } from "../server/emailChannel/gmailProvider";
import {
  emailParticipantAddress,
  inboxEmailParticipantTitle,
  isTrustworthyEmailDisplayName,
  nameCollidesWithConnectedAccount,
  resolveEmailParticipantDisplayName,
} from "../shared/emailParticipantLabel";
import { aggregateEmailContactLifecyclePreflight } from "../shared/emailContactLifecyclePreflight";
import { inboxOnlySourceDetails, savedContactSourceDetails } from "../shared/contactCrmVisibility";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function gmailRaw(headers: Array<{ name: string; value: string }>, id = "m1", threadId = "t1") {
  return {
    id,
    threadId,
    snippet: "hello",
    internalDate: "1710000000000",
    payload: { headers, body: { data: "" } },
  };
}

test("Gmail From with no display name → Inbox title uses the email address", () => {
  const normalized = normalizeGmailApiMessage(
    gmailRaw([
      { name: "From", value: "ssammikat@aol.com" },
      { name: "To", value: "owner@workspace.example" },
    ]),
    "owner@workspace.example",
  );
  assert.equal(normalized?.direction, "inbound");
  assert.equal(normalized?.from.name, null);
  const name = resolveEmailParticipantDisplayName({
    direction: "inbound",
    participantEmail: normalized!.from.email,
    fromName: normalized!.from.name,
    mailboxOwnerNames: ["Yaniv Haramatiy"],
  });
  assert.equal(name, "ssammikat@aol.com");
  assert.equal(
    inboxEmailParticipantTitle({
      isInboxOnly: true,
      contactName: "Yaniv Haramatiy",
      contactEmail: "ssammikat@aol.com",
      inboundFromName: null,
      mailboxOwnerNames: ["Yaniv Haramatiy"],
    }),
    "ssammikat@aol.com",
  );
});

test("Gmail From with a valid display name → Inbox title uses that sender name", () => {
  const normalized = normalizeGmailApiMessage(
    gmailRaw([
      { name: "From", value: '"Ada Lovelace" <ada@example.com>' },
      { name: "To", value: "owner@workspace.example" },
    ]),
    "owner@workspace.example",
  );
  assert.equal(normalized?.from.name, "Ada Lovelace");
  assert.equal(
    resolveEmailParticipantDisplayName({
      direction: "inbound",
      participantEmail: normalized!.from.email,
      fromName: normalized!.from.name,
    }),
    "Ada Lovelace",
  );
});

test("recipient/workspace-owner name never becomes the external sender name", () => {
  const name = resolveEmailParticipantDisplayName({
    direction: "outbound",
    participantEmail: "ssammikat@aol.com",
    fromName: "Yaniv Haramatiy",
    toName: null,
    mailboxOwnerNames: ["Yaniv Haramatiy"],
  });
  assert.equal(name, "ssammikat@aol.com");
  assert.equal(isTrustworthyEmailDisplayName("Yaniv Haramatiy", "ssammikat@aol.com", ["Yaniv Haramatiy"]), false);
});

test("sent-mail and inbound-mail direction cannot cross-assign participant identity", () => {
  assert.equal(
    emailParticipantAddress({
      direction: "outbound",
      fromEmail: "owner@workspace.example",
      toEmail: "ssammikat@aol.com",
    }),
    "ssammikat@aol.com",
  );
  assert.equal(
    emailParticipantAddress({
      direction: "inbound",
      fromEmail: "ssammikat@aol.com",
      toEmail: "owner@workspace.example",
    }),
    "ssammikat@aol.com",
  );
  const outbound = normalizeGmailApiMessage(
    gmailRaw([
      { name: "From", value: '"Yaniv Haramatiy" <owner@workspace.example>' },
      { name: "To", value: "ssammikat@aol.com" },
    ]),
    "owner@workspace.example",
  );
  assert.equal(outbound?.direction, "outbound");
  assert.equal(outbound?.from.email, "owner@workspace.example");
  assert.equal(outbound?.to[0]?.email, "ssammikat@aol.com");
});

test("existing intentionally saved Contact name remains stable", () => {
  const match = read("server/emailChannel/contactMatch.ts");
  const existingBlock = match.slice(
    match.indexOf("if (existing.length > 0)"),
    match.indexOf("const kind = decideNewEmailContactKind({"),
  );
  assert.doesNotMatch(existingBlock, /name:/);
  assert.match(match, /resolveEmailParticipantDisplayName/);
});

test("auto-created legacy wrong-name candidate is classified by preflight", () => {
  const agg = aggregateEmailContactLifecyclePreflight([
    {
      userId: "t1",
      source: "email",
      email: "one@example.com",
      name: "Owner Name",
      tag: "New",
      pipelineStage: "Lead",
      mailboxDisplayName: "Owner Name",
      sourceDetails: savedContactSourceDetails(),
    },
  ]);
  assert.equal(agg.safeInboxOnlyCandidates, 1);
  assert.equal(agg.autoCreatedConnectedAccountNameCandidates, 1);
  assert.equal(agg.ambiguousRequiresReview, 0);
  assert.equal(nameCollidesWithConnectedAccount({ name: "Owner Name", mailboxDisplayName: "Owner Name" }), true);
});

test("two subjects may create separate threads but reuse the same tenant-scoped participant", () => {
  const persist = read("server/emailChannel/persistInbound.ts");
  assert.match(persist, /findEmailConversationByThread/);
  assert.match(persist, /externalThreadId: normalized.providerThreadId/);
  const match = read("server/emailChannel/contactMatch.ts");
  assert.match(match, /eq\(contacts\.userId, workspaceUserId\)/);
  assert.match(persist, /toName: normalized\.to\[0\]\?\.name/);
  assert.match(persist, /mailboxOwnerNames: \[mailbox\.displayName\]/);
});

test("another tenant with the same email remains isolated", () => {
  const match = read("server/emailChannel/contactMatch.ts");
  assert.match(match, /eq\(contacts\.userId, workspaceUserId\)/);
  assert.doesNotMatch(match, /eq\(contacts\.name/);
});

test("Save to Contacts appears for inbox-only and Edit Contact appears for saved", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /isEmailInboxIdentitySource\(contact\.source\) \? \(/);
  assert.match(inbox, /button-save-to-contacts/);
  assert.match(inbox, /handleEditContact/);
  assert.match(inbox, /inboxEmailParticipantTitle/);
});

test("promotion preserves conversation history", () => {
  const promote = read("server/emailChannel/contactMatch.ts");
  assert.match(promote, /if \(isCrmListedContact\(contact\)\) return contact/);
  assert.match(promote, /storage\.updateContact\(contact\.id/);
  assert.doesNotMatch(
    promote.slice(
      promote.indexOf("export async function promoteInboxIdentityToCrm"),
      promote.indexOf("export async function resolveEmailContact"),
    ),
    /createContact/,
  );
});
