/**
 * Email message trash — unit tests (no live Gmail).
 * Run: npx tsx tests/email-trash-message.test.ts
 */
import assert from "node:assert/strict";
import { GMAIL_OAUTH_SCOPES } from "../shared/emailChannel";
import { GmailEmailProvider } from "../server/emailChannel/gmailProvider";
import { isEmailConversationChannel } from "../shared/inboxRowModel";

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

async function main() {
  await run("gmail.modify is present so users.messages.trash can be authorized", () => {
    assert.ok(GMAIL_OAUTH_SCOPES.includes("https://www.googleapis.com/auth/gmail.modify"));
  });

  await run("quick-delete is email-channel gated", () => {
    assert.equal(isEmailConversationChannel("email"), true);
    assert.equal(isEmailConversationChannel("whatsapp"), false);
    assert.equal(isEmailConversationChannel("facebook"), false);
    assert.equal(isEmailConversationChannel("instagram"), false);
  });

  await run("trashMessage posts to /messages/{id}/trash with Bearer token", async () => {
    const provider = new GmailEmailProvider();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "msg-1", labelIds: ["TRASH"] }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await provider.trashMessage!({
        accessToken: "ya29.test",
        providerMessageId: "gmail-msg-abc",
      });
      assert.equal(result.success, true);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/messages\/gmail-msg-abc\/trash$/);
      assert.equal(calls[0].init?.method, "POST");
      assert.equal(
        (calls[0].init?.headers as Record<string, string>).Authorization,
        "Bearer ya29.test",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  await run("trashMessage treats Gmail 404 as already-trashed success", async () => {
    const provider = new GmailEmailProvider();
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 })) as typeof fetch;
    try {
      const result = await provider.trashMessage!({
        accessToken: "ya29.test",
        providerMessageId: "gone",
      });
      assert.equal(result.success, true);
      assert.equal(result.alreadyTrashed, true);
    } finally {
      globalThis.fetch = original;
    }
  });

  await run("trashMessage rejects empty provider message id", async () => {
    const provider = new GmailEmailProvider();
    const result = await provider.trashMessage!({
      accessToken: "ya29.test",
      providerMessageId: "  ",
    });
    assert.equal(result.success, false);
  });

  console.log("\nAll email trash message tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
