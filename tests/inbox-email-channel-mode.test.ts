/**
 * Inbox email channel mode — reachability + subject display helpers.
 * Run: npx tsx tests/inbox-email-channel-mode.test.ts
 */
import assert from "node:assert/strict";

type Channel = string;

type Contact = {
  email?: string;
  phone?: string;
  whatsappId?: string;
  primaryChannel?: Channel;
  lastIncomingChannel?: Channel;
  source?: string;
};

function contactHasWebchatReachability(
  c: Contact,
  conversations?: Array<{ channel: Channel | string }>,
): boolean {
  if (c.lastIncomingChannel === "webchat" || c.primaryChannel === "webchat" || c.source === "webchat") {
    return true;
  }
  return conversations?.some((x) => x.channel === "webchat") ?? false;
}

function getReachableChannelsForContact(
  c: Contact | undefined,
  conversations?: Array<{ channel: Channel | string }>,
): Channel[] {
  if (!c) return [];
  const keys = new Set<string>();
  if (c.whatsappId) keys.add("whatsapp");
  if (c.phone) keys.add("sms");
  if (c.email && String(c.email).includes("@")) keys.add("email");
  if (contactHasWebchatReachability(c, conversations)) keys.add("webchat");
  const order: Channel[] = ["whatsapp", "sms", "webchat", "email"];
  return order.filter((k) => keys.has(k));
}

function replySubject(existing?: string | null): string {
  const subj = String(existing || "").trim();
  if (!subj) return "";
  return subj.startsWith("Re:") ? subj : `Re: ${subj}`;
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("contact with email is email-reachable", () => {
  const channels = getReachableChannelsForContact({ email: "ada@example.com" });
  assert.deepEqual(channels, ["email"]);
});

run("email + whatsapp both reachable when identifiers exist", () => {
  const channels = getReachableChannelsForContact({
    email: "ada@example.com",
    whatsappId: "15551234567",
  });
  assert.ok(channels.includes("email"));
  assert.ok(channels.includes("whatsapp"));
});

run("invalid email string is not reachable", () => {
  const channels = getReachableChannelsForContact({ email: "not-an-email" });
  assert.equal(channels.includes("email"), false);
});

run("reply subject prefixes Re: once", () => {
  assert.equal(replySubject("Tour follow-up"), "Re: Tour follow-up");
  assert.equal(replySubject("Re: Tour follow-up"), "Re: Tour follow-up");
  assert.equal(replySubject(""), "");
});

console.log("\nAll inbox email channel mode tests passed.");
